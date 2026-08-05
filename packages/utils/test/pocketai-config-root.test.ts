import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { resolveConfigRoot } from "../src/dirs";

describe("config root resolution", () => {
	test("keeps an absolute PI_CONFIG_DIR outside the user's home", () => {
		expect(resolveConfigRoot("/Users/example", "/private/tmp/pocketai-omp")).toBe(
			path.normalize("/private/tmp/pocketai-omp"),
		);
	});

	test("keeps the normal relative OMP config directory under home", () => {
		expect(resolveConfigRoot("/Users/example", ".omp")).toBe(path.join("/Users/example", ".omp"));
	});
});
