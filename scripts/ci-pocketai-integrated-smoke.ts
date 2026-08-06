#!/usr/bin/env bun

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline";

type RpcFrame = Record<string, unknown>;

const POLICY_MARKER = "POCKETAI_AMBIENT_CONTEXT_MUST_NOT_LOAD";
const RESTRICTED_REQUEST_IDS = ["bash", "host-tools", "host-url", "login"] as const;
const REQUIRED_RESPONSE_IDS = new Set(["state", "models", "commands", ...RESTRICTED_REQUEST_IDS]);

function isRecord(value: unknown): value is RpcFrame {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithin(root: string, candidate: string): boolean {
	const normalizedRoot = process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
	const normalizedCandidate =
		process.platform === "win32" ? path.resolve(candidate).toLowerCase() : path.resolve(candidate);
	const relative = path.relative(normalizedRoot, normalizedCandidate);
	return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function runPolicyProbe(binary: string): Promise<void> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "pocketai-omp-integrated-smoke-"));
	const agentDir = path.join(root, "agent");
	const homeDir = path.join(root, "home");
	const dataDir = path.join(root, "data");
	const stateDir = path.join(root, "state");
	const cacheDir = path.join(root, "cache");
	const workspace = path.join(root, "workspace");
	// OMP uses XDG data directories on macOS/Linux, while Windows intentionally
	// keeps session data under PI_CODING_AGENT_DIR.
	const sessionRoot =
		process.platform === "win32" ? path.join(agentDir, "sessions") : path.join(dataDir, "omp", "sessions");

	await Promise.all([
		fs.mkdir(agentDir, { recursive: true }),
		fs.mkdir(homeDir, { recursive: true }),
		fs.mkdir(path.join(dataDir, "omp"), { recursive: true }),
		fs.mkdir(path.join(stateDir, "omp"), { recursive: true }),
		fs.mkdir(path.join(cacheDir, "omp"), { recursive: true }),
		fs.mkdir(workspace, { recursive: true }),
	]);
	await fs.writeFile(path.join(workspace, "AGENTS.md"), `${POLICY_MARKER}\n`, "utf8");
	await fs.writeFile(path.join(workspace, ".env"), "OPENROUTER_API_KEY=project-secret-must-not-load\n", "utf8");
	await fs.writeFile(path.join(homeDir, ".env"), "ANTHROPIC_API_KEY=home-secret-must-not-load\n", "utf8");
	await fs.writeFile(
		path.join(agentDir, "models.yml"),
		[
			"providers:",
			"  pocketai:",
			"    baseUrl: http://127.0.0.1:9/v1",
			"    auth: none",
			"    api: openai-completions",
			"    models:",
			"      - id: pocketai-release-smoke",
			"        name: PocketAI release smoke",
			"        input: [text, image]",
			"",
		].join("\n"),
		"utf8",
	);

	const child = spawn(
		path.resolve(binary),
		[
			"--mode",
			"rpc",
			"--model",
			"pocketai/pocketai-release-smoke",
			"--no-tools",
			"--no-rules",
			"--no-skills",
			"--no-extensions",
		],
		{
			cwd: workspace,
			env: {
				...process.env,
				POCKETAI_OMP_INTEGRATED: "1",
				HOME: homeDir,
				USERPROFILE: homeDir,
				PI_CONFIG_DIR: root,
				PI_CODING_AGENT_DIR: agentDir,
				XDG_DATA_HOME: dataDir,
				XDG_STATE_HOME: stateDir,
				XDG_CACHE_HOME: cacheDir,
				OPENAI_API_KEY: "ambient-secret-must-not-load",
				OMP_AUTH_BROKER_TOKEN: "ambient-broker-secret-must-not-load",
			},
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	const stderr: Buffer[] = [];
	child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
	const responses = new Map<string, RpcFrame>();
	let availableCommands: unknown;
	let sent = false;
	let settled = false;

	try {
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(
					new Error(
						`Timed out waiting for Integrated RPC policy responses: ${Buffer.concat(stderr).toString("utf8")}`,
					),
				);
			}, 30_000);
			const finish = (error?: Error): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				if (error) reject(error);
				else resolve();
			};

			child.once("error", finish);
			child.once("exit", (code, signal) => {
				if (!settled) {
					finish(
						new Error(
							`Integrated RPC exited before verification (code=${String(code)}, signal=${String(signal)}): ${Buffer.concat(stderr).toString("utf8")}`,
						),
					);
				}
			});

			const lines = createInterface({ input: child.stdout });
			lines.on("line", line => {
				let frame: unknown;
				try {
					frame = JSON.parse(line);
				} catch {
					return;
				}
				if (!isRecord(frame)) return;
				if (frame.type === "available_commands_update") availableCommands = frame.commands;
				if (frame.type === "ready" && !sent) {
					sent = true;
					for (const request of [
						{ id: "state", type: "get_state" },
						{ id: "models", type: "get_available_models" },
						{ id: "commands", type: "get_available_commands" },
						{ id: "bash", type: "bash", command: "echo SHOULD_NOT_RUN" },
						{ id: "host-tools", type: "set_host_tools", tools: [] },
						{ id: "host-url", type: "set_host_url", url: "http://127.0.0.1:9" },
						{ id: "login", type: "get_login_providers" },
					]) {
						child.stdin.write(`${JSON.stringify(request)}\n`);
					}
				}
				if (frame.type === "response" && typeof frame.id === "string") responses.set(frame.id, frame);
				if ([...REQUIRED_RESPONSE_IDS].every(id => responses.has(id))) finish();
			});
		});

		assert(
			Array.isArray(availableCommands) && availableCommands.length === 0,
			"Integrated advertised slash commands",
		);
		const stateResponse = responses.get("state");
		assert(stateResponse?.success === true && isRecord(stateResponse.data), "Integrated get_state failed");
		const state = stateResponse.data;
		assert(Array.isArray(state.dumpTools) && state.dumpTools.length === 0, "Integrated exposed runtime-native tools");
		assert(Array.isArray(state.systemPrompt), "Integrated did not report its system prompt");
		assert(
			!state.systemPrompt.some(prompt => typeof prompt === "string" && prompt.includes(POLICY_MARKER)),
			"Integrated loaded ambient AGENTS.md content",
		);
		assert(typeof state.sessionFile === "string", "Integrated did not report an isolated session file");
		assert(
			isWithin(sessionRoot, state.sessionFile),
			`Integrated session escaped isolated data root: ${state.sessionFile}`,
		);
		assert(isRecord(state.model), "Integrated state did not report its model");
		assert(state.model.provider === "pocketai", "Integrated selected a non-PocketAI provider");

		const modelsResponse = responses.get("models");
		assert(modelsResponse?.success === true && isRecord(modelsResponse.data), "Integrated model discovery failed");
		assert(Array.isArray(modelsResponse.data.models), "Integrated model discovery returned an invalid model list");
		assert(modelsResponse.data.models.length > 0, "Integrated did not discover its PocketAI model");
		assert(
			modelsResponse.data.models.every(model => isRecord(model) && model.provider === "pocketai"),
			"Integrated discovered a provider from ambient credentials",
		);

		const commandsResponse = responses.get("commands");
		assert(
			commandsResponse?.success === true &&
				isRecord(commandsResponse.data) &&
				Array.isArray(commandsResponse.data.commands) &&
				commandsResponse.data.commands.length === 0,
			"Integrated get_available_commands exposed commands",
		);
		for (const id of RESTRICTED_REQUEST_IDS) {
			const response = responses.get(id);
			assert(
				response?.success === false && response.code === "pocketai_integrated_restricted",
				`Integrated did not fail closed for ${id}`,
			);
		}
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill();
			await new Promise<void>(resolve => {
				const timeout = setTimeout(resolve, 5_000);
				child.once("exit", () => {
					clearTimeout(timeout);
					resolve();
				});
			});
		}
		await fs.rm(root, { recursive: true, force: true });
	}
}

const binary = process.argv[2];
if (!binary) {
	throw new Error("usage: bun scripts/ci-pocketai-integrated-smoke.ts <omp-binary>");
}

await runPolicyProbe(binary);
console.log("PocketAI Integrated policy smoke: ok");
