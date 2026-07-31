(ns mge.tf.rama.teams-module-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.teams-module :as tm]))

(def MODULE-NAME "mge.tf.rama.teams-module/TeamsModule")

(defn append-event!
  [depot event]
  (get (foreign-append! depot event) "teams"))

(defn create!
  [depot team-id steam-id]
  (append-event!
   depot
   {"type" "create-team"
    "teamId" team-id
    "steamId" steam-id
    "name" "Alpha"
    "acronym" "ALF"
    "formatId" "2"
    "seasonId" "s1"
    "divisionId" "d1"
    "regionId" "r1"}))

(deftest teams-lifecycle-test
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc tm/TeamsModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*team-depot")
          teams (foreign-pstate ipc MODULE-NAME "$$teams")
          roster (foreign-pstate ipc MODULE-NAME "$$roster")
          player-season (foreign-pstate ipc MODULE-NAME "$$player-season")]

      (testing "create-team"
        (is (= true (get (create! depot "t1" "p1") "ok")))
        (is (= "UNREADY" (foreign-select-one (keypath "t1" "status") teams)))
        (is (= "Alpha" (foreign-select-one (keypath "t1" "name") teams)))
        (is (= true (foreign-select-one (keypath "t1" "p1" "active") roster)))
        (is (= "ADMIN" (foreign-select-one (keypath "t1" "p1" "permissionLevel") roster)))
        (is (= "t1" (foreign-select-one (keypath "p1" "s1") player-season))))

      (testing "duplicate team / player season blocked"
        (is (= "team-exists" (get (create! depot "t1" "p9") "error")))
        (is (= "player-already-on-team" (get (create! depot "t2" "p1") "error"))))

      (testing "join + roster cap"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "join-team" "teamId" "t1" "steamId" "p2"})
                    "ok")))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "join-team" "teamId" "t1" "steamId" "p3"})
                    "ok")))
        (is (= "roster-full"
               (get (append-event!
                     depot
                     {"type" "join-team" "teamId" "t1" "steamId" "p4"})
                    "error")))
        (is (= "t1" (foreign-select-one (keypath "p2" "s1") player-season))))

      (testing "leave frees season slot"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "leave-team" "teamId" "t1" "steamId" "p3"})
                    "ok")))
        (is (nil? (foreign-select-one (keypath "t1" "p3") roster)))
        (is (nil? (foreign-select-one (keypath "p3" "s1") player-season)))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "join-team" "teamId" "t1" "steamId" "p4"})
                    "ok"))))

      (testing "status + member permission"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-status" "teamId" "t1" "status" "PENDING"})
                    "ok")))
        (is (= "PENDING" (foreign-select-one (keypath "t1" "status") teams)))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-member-permission"
                      "teamId" "t1"
                      "steamId" "p2"
                      "permissionLevel" "ADMIN"})
                    "ok")))
        (is (= "ADMIN"
               (foreign-select-one (keypath "t1" "p2" "permissionLevel") roster)))))))
