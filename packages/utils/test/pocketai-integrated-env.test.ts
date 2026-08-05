import { describe, expect, it } from "bun:test";
import { filterPocketAiIntegratedLaunchEnv, isPocketAiIntegratedLaunchEnvName } from "../src/pocketai-integrated-env";

describe("PocketAI Integrated launch environment", () => {
	it("retains only OS runtime and isolated PocketAI directory inputs", () => {
		const filtered = filterPocketAiIntegratedLaunchEnv({
			PATH: "/usr/bin",
			HOME: "/isolated/home",
			PI_CONFIG_DIR: "/isolated/config",
			POCKETAI_OMP_INTEGRATED: "1",
			OPENAI_API_KEY: "ambient-openai-secret",
			ANTHROPIC_API_KEY: "ambient-anthropic-secret",
			OMP_AUTH_BROKER_TOKEN: "ambient-broker-secret",
			AWS_SECRET_ACCESS_KEY: "ambient-aws-secret",
		});

		expect(filtered).toEqual({
			PATH: "/usr/bin",
			HOME: "/isolated/home",
			PI_CONFIG_DIR: "/isolated/config",
			POCKETAI_OMP_INTEGRATED: "1",
		});
	});

	it("matches Windows host variable names case-insensitively", () => {
		expect(isPocketAiIntegratedLaunchEnvName("SystemRoot")).toBe(true);
		expect(isPocketAiIntegratedLaunchEnvName("ProgramFiles(x86)")).toBe(true);
		expect(isPocketAiIntegratedLaunchEnvName("openai_api_key")).toBe(false);
	});
});
