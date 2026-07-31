//! UsersModule ported to `.rama` — the empirical end-to-end proof.
//!
//! Mirrors `rama/test/mge/tf/rama/users_module_test.clj` against the
//! generated module. Run with `cargo test --test users_smoke -- --ignored`.

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
fn generated_users_module_runs_full_lifecycle() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let workspace = crate_dir.parent().expect("workspace parent");
    let rama = workspace.join("rama");
    let module_path = rama.join("src/Users.clj");
    let test_path = rama.join("test/generated_users_test.clj");
    let _cleanup = GeneratedFiles(vec![module_path.clone(), test_path.clone()]);

    let source =
        fs::read_to_string(crate_dir.join("fixtures/users_v2.rama")).expect("users fixture");
    let ast = parse(&source).expect("parse users fixture");
    fs::write(&module_path, emit_clojure(&ast)).expect("write generated module");
    fs::write(&test_path, USERS_TEST).expect("write users lifecycle test");

    let output = Command::new("lein")
        .args(["test-rama", "generated-users-test"])
        .current_dir(&rama)
        .output()
        .expect("run lein test-rama");

    assert!(
        output.status.success(),
        "generated users module failed:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

const USERS_TEST: &str = r#"
(ns generated-users-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [Users :as generated]))

(def MODULE-NAME "Users/UsersModule")

(defn append-event! [depot event]
  (get (foreign-append! depot event) "main"))

(deftest generated-users-lifecycle
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc generated/UsersModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*userDepot")
          users (foreign-pstate ipc MODULE-NAME "$$users")
          discord (foreign-pstate ipc MODULE-NAME "$$discordById")]

      (testing "upsert-profile initializes defaults once"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "upsert-profile"
                      "steamId" "s1"
                      "username" "alice"
                      "avatarUrl" "http://a"})
                    "ok")))
        (is (= "alice" (foreign-select-one (keypath "s1" "username") users)))
        (is (= "GUEST" (foreign-select-one (keypath "s1" "permissionLevel") users)))
        (is (= 0 (foreign-select-one (keypath "s1" "sessionVersion") users))))

      (testing "typed event boundary"
        (let [bad (append-event!
                   depot
                   {"type" "set-permission" "steamId" "s1"})]
          (is (= "invalid-event" (get bad "error")))
          (is (= "missing field `permissionLevel`" (get bad "detail")))))

      (testing "permission + ban bump session"
        (is (= "invalid-permission-level"
               (get (append-event!
                     depot
                     {"type" "set-permission"
                      "steamId" "s1"
                      "permissionLevel" "SUPERUSER"})
                    "error")))
        (is (= 1
               (get (append-event!
                     depot
                     {"type" "set-permission"
                      "steamId" "s1"
                      "permissionLevel" "ADMIN"})
                    "sessionVersion")))
        (is (= 2
               (get (append-event!
                     depot
                     {"type" "set-ban"
                      "steamId" "s1"
                      "banStatus" "BANNED"})
                    "sessionVersion")))
        (is (= "ADMIN" (foreign-select-one (keypath "s1" "permissionLevel") users)))
        (is (= "BANNED" (foreign-select-one (keypath "s1" "banStatus") users))))

      (testing "bump-session requires existing user"
        (is (= "user-not-found"
               (get (append-event!
                     depot
                     {"type" "bump-session" "steamId" "ghost"})
                    "error")))
        (is (= 3
               (get (append-event!
                     depot
                     {"type" "bump-session" "steamId" "s1"})
                    "sessionVersion"))))

      (testing "discord link uniqueness across partitions"
        (append-event!
         depot
         {"type" "upsert-profile"
          "steamId" "s2"
          "username" "bob"
          "avatarUrl" "http://c"})
        (is (= true
               (get (append-event!
                     depot
                     {"type" "link-discord"
                      "steamId" "s1"
                      "discordId" "d1"})
                    "ok")))
        (is (= "s1" (foreign-select-one (keypath "d1") discord)))
        (is (= "discord-taken"
               (get (append-event!
                     depot
                     {"type" "link-discord"
                      "steamId" "s2"
                      "discordId" "d1"})
                    "error")))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "link-discord"
                      "steamId" "s1"
                      "discordId" "d2"})
                    "ok")))
        (is (nil? (foreign-select-one (keypath "d1") discord))
            "relinking clears the old reverse-index entry")
        (is (= true
               (get (append-event!
                     depot
                     {"type" "unlink-discord" "steamId" "s1"})
                    "ok")))
        (is (nil? (foreign-select-one (keypath "d2") discord)))))))
"#;
