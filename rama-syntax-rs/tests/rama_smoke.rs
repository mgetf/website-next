//! Cutover proof: the generated MatchModule replaces the handwritten one and
//! must pass the ORIGINAL `match-module-test` unchanged, plus typed-boundary
//! assertions (invalid events acked, JSON Integer coercion).
//!
//! Run with `cargo test --test rama_smoke -- --ignored`.

use rama_syntax::{emit_clojure, parse};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

struct RestoreOnDrop {
    path: PathBuf,
    original: String,
    extra: PathBuf,
}

impl Drop for RestoreOnDrop {
    fn drop(&mut self) {
        let _ = fs::write(&self.path, &self.original);
        let _ = fs::remove_file(&self.extra);
    }
}

#[test]
#[ignore = "requires Leiningen plus downloaded Rama dependencies"]
fn generated_match_module_passes_original_test_suite() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let workspace = crate_dir.parent().expect("workspace parent");
    let rama = workspace.join("rama");
    let module_path = rama.join("src/mge/tf/rama/match_module.clj");
    let extra_test_path = rama.join("test/generated_match_extra_test.clj");

    let original = fs::read_to_string(&module_path).expect("handwritten match module");
    let _restore = RestoreOnDrop {
        path: module_path.clone(),
        original,
        extra: extra_test_path.clone(),
    };

    let source =
        fs::read_to_string(crate_dir.join("fixtures/match_v2.rama")).expect("match fixture");
    let ast = parse(&source).expect("parse match fixture");
    fs::write(&module_path, emit_clojure(&ast)).expect("write generated module");
    fs::write(&extra_test_path, EXTRA_TEST).expect("write extra assertions");

    let output = Command::new("lein")
        .args([
            "test-rama",
            "mge.tf.rama.match-module-test",
            "generated-match-extra-test",
        ])
        .current_dir(&rama)
        .output()
        .expect("run lein test-rama");

    assert!(
        output.status.success(),
        "generated match module failed the original suite:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

const EXTRA_TEST: &str = r#"
(ns generated-match-extra-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.match-module :as mm]))

(def MODULE-NAME "mge.tf.rama.match-module/MatchModule")

(defn append-event! [depot event]
  (get (foreign-append! depot event) "matches"))

(deftest typed-event-boundary
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc mm/MatchModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*match-depot")
          matches (foreign-pstate ipc MODULE-NAME "$$matches")]

      (testing "JSON-style Integer boGames coerces at the boundary"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "create-match"
                      "matchId" "mi"
                      "homeTeamId" "home"
                      "awayTeamId" "away"
                      "seasonId" "s1"
                      "boGames" (int 2)
                      "pool" ["process"]})
                    "ok")))
        (is (= 2 (foreign-select-one (keypath "mi" "boGames") matches))))

      (testing "malformed events ack with precise detail"
        (let [bad (append-event!
                   depot
                   {"type" "ban-map" "matchId" 123 "teamId" "home"})]
          (is (= "invalid-event" (get bad "error")))
          (is (= "field `matchId` must be a String" (get bad "detail"))))
        (let [missing (append-event!
                       depot
                       {"type" "ban-map" "matchId" "mi" "teamId" "home"})]
          (is (= "missing field `arenaId`" (get missing "detail")))))

      (testing "unknown types ack"
        (is (= "unknown-type"
               (get (append-event! depot {"type" "mystery" "matchId" "mi"})
                    "error")))))))
"#;
