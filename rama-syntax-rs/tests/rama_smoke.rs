//! Real Rama compiler smoke test.
//!
//! Run explicitly with:
//! `cargo test --test rama_smoke -- --ignored`

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
fn generated_match_module_runs_full_lifecycle() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let workspace = crate_dir.parent().expect("workspace parent");
    let rama = workspace.join("rama");
    let module_path = rama.join("src/Match.clj");
    let test_path = rama.join("test/generated_match_test.clj");
    let _cleanup = GeneratedFiles(vec![module_path.clone(), test_path.clone()]);

    let source =
        fs::read_to_string(crate_dir.join("fixtures/match_v2.rama")).expect("read match fixture");
    let ast = parse(&source).expect("parse match fixture");
    fs::write(&module_path, emit_clojure(&ast)).expect("write generated module");
    fs::write(&test_path, SMOKE_TEST).expect("write Rama smoke test");

    let output = Command::new("lein")
        .args(["test-rama", "generated-match-test"])
        .current_dir(&rama)
        .output()
        .expect("run lein test-rama");

    assert!(
        output.status.success(),
        "generated Rama module failed:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

const SMOKE_TEST: &str = r#"
(ns generated-match-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is]]
   [com.rpl.rama.test :as rtest]
   [Match :as generated]))

(defn append-event! [depot event]
  (get (foreign-append! depot event) "main"))

(deftest generated-module-lifecycle
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc generated/MatchModule {:tasks 4 :threads 2})
    (    let [module-name "Match/MatchModule"
          depot (foreign-depot ipc module-name "*matchDepot")
          matches (foreign-pstate ipc module-name "$$matches")
          map-bans (foreign-pstate ipc module-name "$$mapBans")
          team-stats (foreign-pstate ipc module-name "$$teamStats")
          by-team (foreign-pstate ipc module-name "$$matchesByTeam")
          ack (append-event!
               depot
               {"type" "create-match"
                "matchId" "m1"
                "homeTeamId" "home"
                "awayTeamId" "away"
                "seasonId" "s1"
                "boGames" (int 2) ;; JSON-style Integer: boundary must coerce
                "pool" ["process" "discard"]})]
      (is (= true (get ack "ok")))
      (is (= "UNPLAYED"
             (foreign-select-one (keypath "m1" "status") matches)))
      ;; Cross-partition index writes after |hash hops. These are the
      ;; assertions that expose lost writes when PStates are passed as
      ;; deframaop parameters across partitioners.
      (is (= "s1" (foreign-select-one (keypath "home" "m1") by-team)))
      (is (= "s1" (foreign-select-one (keypath "away" "m1") by-team)))
      ;; The generated validator acks malformed events instead of
      ;; killing the worker.
      (let [bad (append-event!
                 depot
                 {"type" "ban-map"
                  "matchId" 123
                  "teamId" "home"
                  "arenaId" "process"})]
        (is (= false (get bad "ok")))
        (is (= "invalid-event" (get bad "error")))
        (is (= "field `matchId` must be a String" (get bad "detail"))))
      (let [missing (append-event!
                     depot
                     {"type" "ban-map"
                      "matchId" "m1"
                      "teamId" "home"})]
        (is (= "invalid-event" (get missing "error")))
        (is (= "missing field `arenaId`" (get missing "detail"))))
      ;; Long comparisons in submit-score prove the create-match Integer
      ;; was coerced before storage.
      (is (= "not-your-turn"
             (get (append-event!
                   depot
                   {"type" "ban-map"
                    "matchId" "m1"
                    "teamId" "home"
                    "arenaId" "process"})
                  "error")))
      (is (= true
             (get (append-event!
                   depot
                   {"type" "ban-map"
                    "matchId" "m1"
                    "teamId" "away"
                    "arenaId" "process"})
                  "ok")))
      (is (= 1 (foreign-select-one (keypath "m1" "turn") map-bans)))
      (is (= true
             (get (append-event!
                   depot
                   {"type" "submit-score"
                    "matchId" "m1"
                    "homeScore" 2
                    "awayScore" 0})
                  "ok")))
      (is (= "PLAYED" (foreign-select-one (keypath "m1" "status") matches)))
      (is (= 1 (foreign-select-one (keypath "home" "wins") team-stats))))))
"#;
