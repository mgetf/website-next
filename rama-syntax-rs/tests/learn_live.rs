//! Live end-to-end proof of the learning loop.
//!
//! Requires a running nREPL at 127.0.0.1:7888 (started from `rama/`).
//! Run with `cargo test --test learn_live -- --ignored`.

use std::fs;
use std::process::Command;

#[test]
#[ignore = "requires a live nREPL at 127.0.0.1:7888"]
fn runtime_violation_corrects_source_and_exposes_static_bug() {
    let crate_dir = env!("CARGO_MANIFEST_DIR");
    let fixture = format!("{crate_dir}/fixtures/typed_fn.rama");
    let scratch = std::env::temp_dir().join(format!("learn-live-{}.rama", std::process::id()));
    fs::copy(&fixture, &scratch).expect("copy fixture");

    // Drive the dishonest extern through the live runtime and apply the fix.
    let learn = Command::new(env!("CARGO_BIN_EXE_rama-check"))
        .args([
            "learn",
            scratch.to_str().unwrap(),
            "--nrepl",
            "127.0.0.1:7888",
            "--eval",
            "(TypedBoundary/bad-extern-return 7)",
            "--write",
        ])
        .output()
        .expect("run learn");
    let stdout = String::from_utf8_lossy(&learn.stdout);
    assert!(learn.status.success(), "learn failed: {stdout}");
    assert!(stdout.contains("fix the pin to `String`"), "{stdout}");
    assert!(stdout.contains("applied 1 fix(es)"), "{stdout}");

    let updated = fs::read_to_string(&scratch).expect("read updated source");
    assert!(
        updated.contains("extern str = clojure.core/str(value: Long) -> String"),
        "{updated}"
    );

    // The corrected pin must move the failure from runtime to compile time,
    // pointing at the function whose declared return is now provably wrong.
    let check = Command::new(env!("CARGO_BIN_EXE_rama-check"))
        .args(["check", scratch.to_str().unwrap()])
        .output()
        .expect("run check");
    let stderr = String::from_utf8_lossy(&check.stderr);
    assert!(!check.status.success());
    assert!(
        stderr.contains("return type `java.lang.String` is not assignable to `java.lang.Long`"),
        "{stderr}"
    );

    let _ = fs::remove_file(&scratch);
}
