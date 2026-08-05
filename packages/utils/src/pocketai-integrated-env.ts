const ALLOWED_ENV_NAMES = new Set([
	"COLORTERM",
	"COMMONPROGRAMFILES",
	"COMMONPROGRAMFILES(X86)",
	"COMSPEC",
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"LOCALAPPDATA",
	"NODE_EXTRA_CA_CERTS",
	"NO_COLOR",
	"PATH",
	"PATHEXT",
	"PI_CODING_AGENT_DIR",
	"PI_CONFIG_DIR",
	"POCKETAI_OMP_INTEGRATED",
	"PROGRAMDATA",
	"PROGRAMFILES",
	"PROGRAMFILES(X86)",
	"SSL_CERT_DIR",
	"SSL_CERT_FILE",
	"SYSTEMDRIVE",
	"SYSTEMROOT",
	"TEMP",
	"TERM",
	"TMP",
	"TMPDIR",
	"TZ",
	"USERPROFILE",
	"WINDIR",
	"XDG_CACHE_HOME",
	"XDG_CONFIG_HOME",
	"XDG_DATA_HOME",
	"XDG_STATE_HOME",
]);

/**
 * Whether a launch-environment name may survive before PocketAI's isolated
 * config and agent dotenv files are loaded. Matching is case-insensitive so
 * the policy behaves identically on Windows and POSIX hosts.
 */
export function isPocketAiIntegratedLaunchEnvName(name: string): boolean {
	return ALLOWED_ENV_NAMES.has(name.toUpperCase());
}

/** Remove ambient credentials and configuration while retaining OS runtime inputs. */
export function filterPocketAiIntegratedLaunchEnv(
	env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
	const filtered: Record<string, string> = {};
	for (const [name, value] of Object.entries(env)) {
		if (value !== undefined && isPocketAiIntegratedLaunchEnvName(name)) filtered[name] = value;
	}
	return filtered;
}
