# Security policy

## Reporting

Please do not open public issues for vulnerabilities. Report privately via
GitHub Security Advisories on this repository. You will receive an
acknowledgment within a few days.

## Scope notes for reporters

- Session event logs (`.aster/`) store full tool inputs/outputs in plaintext;
  treat disclosure paths into that directory as in scope.
- `isolation: "process"` is crash containment and environment scrubbing, not
  a hardened sandbox — escapes of documented guarantees (env allowlisting,
  timeout kill) are in scope; "arbitrary code in a tool can do arbitrary
  things" is not.
- The built-in HTTP channel is documented as unauthenticated; missing-auth
  reports against it are out of scope, request-smuggling or parsing bugs are
  in scope.
