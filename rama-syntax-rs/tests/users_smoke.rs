//! Cutover proof: the generated UsersModule replaces the handwritten one and
//! must pass the ORIGINAL `users-module-test` unchanged, plus extra
//! typed-boundary assertions the handwritten module never had.
//!
//! Run with `cargo test --test users_smoke -- --ignored`.

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
fn generated_users_module_passes_original_test_suite() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let workspace = crate_dir.parent().expect("workspace parent");
    let rama = workspace.join("rama");
    let module_path = rama.join("src/mge/tf/rama/users_module.clj");
    let extra_test_path = rama.join("test/generated_users_extra_test.clj");

    let original = fs::read_to_string(&module_path).expect("handwritten users module");
    let _restore = RestoreOnDrop {
        path: module_path.clone(),
        original,
        extra: extra_test_path.clone(),
    };

    let source =
        fs::read_to_string(crate_dir.join("fixtures/users_v2.rama")).expect("users fixture");
    let ast = parse(&source).expect("parse users fixture");
    fs::write(&module_path, emit_clojure(&ast)).expect("write generated module");
    fs::write(&extra_test_path, EXTRA_TEST).expect("write extra assertions");

    let output = Command::new("lein")
        .args([
            "test-rama",
            "mge.tf.rama.users-module-test",
            "generated-users-extra-test",
        ])
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

const EXTRA_TEST: &str = r#"
(ns generated-users-extra-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.users-module :as um]))

(def MODULE-NAME "mge.tf.rama.users-module/UsersModule")

(defn append-event! [depot event]
  (get (foreign-append! depot event) "users"))

(deftest typed-boundary-and-session-bumps
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc um/UsersModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*user-depot")]

      (testing "generated validator acks malformed events"
        (let [bad (append-event!
                   depot {"type" "set-permission" "steamId" "s1"})]
          (is (= "invalid-event" (get bad "error")))
          (is (= "missing field `permissionLevel`" (get bad "detail"))))
        (let [bad (append-event!
                   depot {"type" "link-discord" "steamId" "s1" "discordId" 42})]
          (is (= "field `discordId` must be a String" (get bad "detail")))))

      (testing "unknown event types ack instead of vanishing"
        (let [ack (append-event! depot {"type" "mystery" "steamId" "s1"})]
          (is (= "unknown-type" (get ack "error")))))

      (testing "bump-session"
        (is (= "user-not-found"
               (get (append-event!
                     depot {"type" "bump-session" "steamId" "ghost"})
                    "error")))
        (append-event!
         depot
         {"type" "upsert-profile"
          "steamId" "s9"
          "username" "zoe"
          "avatarUrl" "http://z"})
        (is (= 1
               (get (append-event!
                     depot {"type" "bump-session" "steamId" "s9"})
                    "sessionVersion")))))))
"#;
