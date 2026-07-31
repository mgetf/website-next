//! Runtime proof for typed higher-order Clojure contracts.

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
fn higher_order_calls_and_contracts_work_in_clojure() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let workspace = crate_dir.parent().expect("workspace parent");
    let rama = workspace.join("rama");
    let module_path = rama.join("src/HigherOrder.clj");
    let test_path = rama.join("test/generated_higher_order_test.clj");
    let _cleanup = GeneratedFiles(vec![module_path.clone(), test_path.clone()]);

    let source = fs::read_to_string(crate_dir.join("fixtures/higher_order.rama")).expect("fixture");
    let ast = parse(&source).expect("parse");
    fs::write(&module_path, emit_clojure(&ast)).expect("write generated namespace");
    fs::write(&test_path, HIGHER_ORDER_TEST).expect("write generated test");

    let output = Command::new("lein")
        .args(["test-rama", "generated-higher-order-test"])
        .current_dir(&rama)
        .output()
        .expect("run higher-order test");

    assert!(
        output.status.success(),
        "higher-order runtime test failed:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

const HIGHER_ORDER_TEST: &str = r#"
(ns generated-higher-order-test
  (:require
   [clojure.test :refer [deftest is]]
   [HigherOrder :as typed]))

(defn violation [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo error
      (ex-data error))))

(deftest higher-order-values
  (let [result (typed/double-all [1 2 3])]
    (is (instance? clojure.lang.LazySeq result))
    (is (= [3 4 5] (vec result))))
  (is (= [1 2] (vec (typed/keep-nonzero [0 1 2]))))
  (is (= [11 22] (vec (typed/pairwise-add [1 2 3] [10 20]))))
  (is (= true (typed/all-nonzero [1 2])))
  (is (= false (typed/all-nonzero [1 0])))
  (is (= nil (typed/first-label [])))
  (is (= "7" (typed/first-label [7])))
  (is (= 6 (typed/total [1 2 3])))
  (is (= [1 2] (typed/collect [1 2])))
  (is (= [3 4] (typed/transform-into [1 2])))
  (is (= "4" (typed/invoke-checked (fn [x] (str x)) 4))))

(deftest higher-order-contracts
  (let [error (violation #(typed/invoke-checked "not-a-function" 1))]
    (is (= :contract-violation (:kind error)))
    (is (= "invoke-checked argument `callback`" (:path error))))

  (let [error (violation #(typed/invoke-checked (fn [x] x) 1))]
    (is (= :contract-violation (:kind error)))
    (is (= "invoke-checked argument `callback` return" (:path error))))

  (let [checked (typed/narrow-callback (fn [x] (str x)))]
    (is (= "9" (checked 9))))

  (let [checked (typed/narrow-callback (fn [x] x))
        error (violation #(checked 1))]
    (is (= :contract-violation (:kind error)))
    (is (= "explicit `as Fn<(java.lang.Long) -> java.lang.String>` return"
           (:path error))))

  ;; Seqable is shape-checked without eagerly realizing. The typed callback
  ;; catches the bad element only when the LazySeq is consumed.
  (let [result (typed/keep-nonzero ["bad"])
        error (violation #(doall result))]
    (is (instance? clojure.lang.LazySeq result))
    (is (= :contract-violation (:kind error)))
    (is (= "nonzero argument `value`" (:path error)))))
"#;
