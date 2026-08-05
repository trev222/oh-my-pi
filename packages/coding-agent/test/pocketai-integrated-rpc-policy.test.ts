import { describe, expect, test } from "bun:test";
import { isPocketAiIntegratedRpcCommandAllowed } from "../src/modes/rpc/rpc-mode";

describe("PocketAI Integrated RPC policy", () => {
	test("allows the model, streaming, cancellation, recovery, and state surface", () => {
		for (const command of [
			"prompt",
			"steer",
			"follow_up",
			"abort",
			"abort_and_prompt",
			"get_state",
			"get_available_models",
			"get_messages_page",
			"compact",
		]) {
			expect(isPocketAiIntegratedRpcCommandAllowed(command)).toBeTrue();
		}
	});

	test("blocks host tools, shell execution, native login, and session escape commands", () => {
		for (const command of [
			"bash",
			"abort_bash",
			"set_host_tools",
			"set_host_uri_schemes",
			"login",
			"get_login_providers",
			"switch_session",
			"branch",
			"handoff",
			"export_html",
		]) {
			expect(isPocketAiIntegratedRpcCommandAllowed(command)).toBeFalse();
		}
	});
});
