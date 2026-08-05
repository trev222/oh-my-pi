import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/args";
import { applyPocketAiIntegratedSessionPolicy } from "../src/main";

describe("PocketAI Integrated CLI policy", () => {
	test("forces ambient capabilities off even when launch arguments request them", () => {
		const parsed = parseArgs(
			[
				"--tools",
				"read,bash",
				"--extension",
				"./extension.ts",
				"--hook",
				"./hook.ts",
				"--plugin-dir",
				"./plugin",
				"--skills",
				"./skill",
				"--add-dir",
				"../outside",
				"--allow-home",
				"--cwd",
				"/workspace",
				"--model",
				"openai/gpt-5.4",
				"answer the user",
			],
			undefined,
			{ pocketAiIntegrated: true },
		);

		expect(parsed.noTools).toBeTrue();
		expect(parsed.pocketAiIntegrated).toBeTrue();
		expect(parsed.tools).toBeUndefined();
		expect(parsed.noExtensions).toBeTrue();
		expect(parsed.extensions).toBeUndefined();
		expect(parsed.hooks).toBeUndefined();
		expect(parsed.pluginDirs).toBeUndefined();
		expect(parsed.noSkills).toBeTrue();
		expect(parsed.skills).toBeUndefined();
		expect(parsed.noRules).toBeTrue();
		expect(parsed.addDir).toBeUndefined();
		expect(parsed.allowHome).toBeFalse();
		expect(parsed.config).toBeUndefined();
		expect(parsed.systemPrompt).toBeUndefined();
		expect(parsed.appendSystemPrompt).toBeUndefined();
		expect(parsed.apiKey).toBeUndefined();
		expect(parsed.autoApprove).toBeFalse();
		expect(parsed.approvalMode).toBe("always-ask");
		expect(parsed.cwd).toBe("/workspace");
		expect(parsed.model).toBe("openai/gpt-5.4");
		expect(parsed.messages).toEqual(["answer the user"]);
	});

	test("leaves normal OMP launch capabilities unchanged", () => {
		const parsed = parseArgs(
			["--tools", "read,bash", "--extension", "./extension.ts", "--add-dir", "../outside", "--allow-home"],
			undefined,
			{ pocketAiIntegrated: false },
		);

		expect(parsed.noTools).toBeUndefined();
		expect(parsed.tools).toEqual(["read", "bash"]);
		expect(parsed.extensions).toEqual(["./extension.ts"]);
		expect(parsed.addDir).toEqual(["../outside"]);
		expect(parsed.allowHome).toBeTrue();
	});

	test("converts Integrated launches into restricted SDK sessions", () => {
		const options = applyPocketAiIntegratedSessionPolicy(
			{ pocketAiIntegrated: true },
			{
				cwd: "/workspace",
				additionalDirectories: ["/outside"],
				customSystemPrompt: "project prompt",
				appendSystemPrompt: "project append",
				toolNames: ["bash"],
				customTools: [],
				enableMCP: true,
				enableLsp: true,
				enableIrc: true,
			},
		);

		expect(options.cwd).toBe("/workspace");
		expect(options.additionalDirectories).toBeUndefined();
		expect(options.customSystemPrompt).toBeUndefined();
		expect(options.appendSystemPrompt).toBeUndefined();
		expect(options.toolNames).toEqual([]);
		expect(options.restrictToolNames).toBeTrue();
		expect(options.allowRestrictedCustomTools).toBeFalse();
		expect(options.enableMCP).toBeFalse();
		expect(options.enableLsp).toBeFalse();
		expect(options.enableIrc).toBeFalse();
		expect(options.disableExtensionDiscovery).toBeTrue();
		expect(options.skills).toEqual([]);
		expect(options.rules).toEqual([]);
		expect(options.contextFiles).toEqual([]);
		expect(options.workspaceTree).toEqual({
			rootPath: "/workspace",
			rendered: "",
			truncated: false,
			totalLines: 0,
			agentsMdFiles: [],
		});
	});
});
