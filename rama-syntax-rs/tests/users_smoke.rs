//! Cutover proof: transpile UsersModule from `.rama` and run the original suite.
//!
//! Run with `cargo test --test users_smoke -- --ignored`.

use std::path::Path;
use std::process::Command;

#[test]
#[ignore = "requires Leiningen plus downloaded Rama dependencies"]
fn generated_users_module_passes_original_test_suite() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let workspace = crate_dir.parent().expect("workspace parent");
    let rama = workspace.join("rama");

    let transpile = Command::new("bash")
        .arg(rama.join("scripts/transpile-rama.sh"))
        .current_dir(&rama)
        .output()
        .expect("transpile");
    assert!(
        transpile.status.success(),
        "transpile failed:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&transpile.stdout),
        String::from_utf8_lossy(&transpile.stderr)
    );

    let output = Command::new("lein")
        .args(["test-rama", "mge.tf.rama.users-module-test"])
        .current_dir(&rama)
        .output()
        .expect("run lein test-rama");

    assert!(
        output.status.success(),
        "generated users module failed the original suite:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}
