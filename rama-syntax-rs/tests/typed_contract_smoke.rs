//! Runtime proof for the typed/untyped Clojure contract seam.
//!
//! Run with `cargo test --test typed_contract_smoke -- --ignored`.

use rama_syntax::{emit_clojure, parse};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

struct GeneratedFiles(Vec<PathBuf>);

impl Drop for GeneratedFiles {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = fs::remove_file(path);
        }
    }
}

#[test]
#[ignore = "requires Leiningen plus downloaded Rama dependencies"]
fn contracts_protect_typed_clojure_boundaries() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let workspace = crate_dir.parent().expect("workspace parent");
    let rama = workspace.join("rama");
    let module_path = rama.join("src/TypedBoundary.clj");
    let test_path = rama.join("test/generated_typed_contract_test.clj");
    let _cleanup = GeneratedFiles(vec![module_path.clone(), test_path.clone()]);

    let source =
        fs::read_to_string(crate_dir.join("fixtures/typed_fn.rama")).expect("typed fixture");
    let ast = parse(&source).expect("parse typed fixture");
    fs::write(&module_path, emit_clojure(&ast)).expect("write generated typed namespace");
    fs::write(&test_path, CONTRACT_TEST).expect("write generated contract test");

    let output = Command::new("lein")
        .args(["test-rama", "generated-typed-contract-test"])
        .current_dir(&rama)
        .output()
        .expect("run contract smoke test");

    assert!(
        output.status.success(),
        "generated contract test failed:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

const CONTRACT_TEST: &str = r#"
(ns generated-typed-contract-test
  (:require
   [clojure.test :refer [deftest is]]
   [TypedBoundary :as typed]))

(defn violation [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo error
      (ex-data error))))

(deftest typed-boundary-contracts
  (is (= "ok" (typed/echo "ok")))
  (is (= nil (typed/maybe-label false "hidden")))
  (is (= "shown" (typed/maybe-label true "shown")))
  (is (= "checked" (typed/checked-string "checked")))
  (is (= ["a" "b"] (typed/copy-strings ["a" "b"])))

  (let [error (violation #(typed/echo 1))]
    (is (= :contract-violation (:kind error)))
    (is (= "echo argument `value`" (:path error)))
    (is (= "java.lang.Long" (:actual error))))

  (let [error (violation #(typed/copy-strings [1]))]
    (is (= :contract-violation (:kind error)))
    (is (= "copy-strings argument `values`" (:path error))))

  (let [error (violation #(typed/checked-string 1))]
    (is (= :contract-violation (:kind error)))
    (is (= "explicit `as java.lang.String`" (:path error)))
    (is (= "java.lang.Long" (:actual error))))

  ;; clojure.core/str returns String, contrary to the declared Long extern.
  (let [error (violation #(typed/bad-extern-return 7))]
    (is (= :contract-violation (:kind error)))
    (is (= "extern `str` return" (:path error)))
    (is (= "java.lang.String" (:actual error)))))
"#;
