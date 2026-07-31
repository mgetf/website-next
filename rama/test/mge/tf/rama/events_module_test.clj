(ns mge.tf.rama.events-module-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.events-module :as em]))

(def MODULE-NAME "mge.tf.rama.events-module/EventsModule")

(defn append-event!
  [depot event]
  (get (foreign-append! depot event) "events"))

(deftest events-lifecycle-test
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc em/EventsModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*event-depot")
          events (foreign-pstate ipc MODULE-NAME "$$events")
          participants (foreign-pstate ipc MODULE-NAME "$$event-participants")
          placements (foreign-pstate ipc MODULE-NAME "$$event-placements")
          snapshot (foreign-pstate ipc MODULE-NAME "$$event-snapshot")]

      (testing "create-event"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "create-event"
                      "eventId" "e1"
                      "name" "MGE Cup"
                      "eventType" "CUP"
                      "isTeamEvent" false
                      "description" "Fun"
                      "avatar" "/e.png"
                      "prizepool" "100.00"})
                    "ok")))
        (is (= "UPCOMING" (foreign-select-one (keypath "e1" "status") events)))
        (is (= "CUP" (foreign-select-one (keypath "e1" "type") events)))
        (is (= [] (foreign-select-one (keypath "e1") participants)))
        (is (= "event-exists"
               (get (append-event!
                     depot
                     {"type" "create-event"
                      "eventId" "e1"
                      "name" "Dup"
                      "eventType" "CUP"})
                    "error")))
        (is (= "invalid-event-type"
               (get (append-event!
                     depot
                     {"type" "create-event"
                      "eventId" "e2"
                      "name" "Bad"
                      "eventType" "LAN"})
                    "error"))))

      (testing "update / status / lists / snapshot"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "update-event"
                      "eventId" "e1"
                      "name" "MGE Cup Finals"
                      "description" "Updated"
                      "avatar" "/e2.png"
                      "startedAt" "2026-08-01T00:00:00Z"
                      "endedAt" ""
                      "prizepool" "250.00"
                      "bracketLink" "https://example/b"
                      "card" "card-1"})
                    "ok")))
        (is (= "MGE Cup Finals" (foreign-select-one (keypath "e1" "name") events)))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-status"
                      "eventId" "e1"
                      "status" "IN_PROGRESS"})
                    "ok")))
        (is (= "IN_PROGRESS" (foreign-select-one (keypath "e1" "status") events)))
        (is (= "invalid-event-status"
               (get (append-event!
                     depot
                     {"type" "set-status"
                      "eventId" "e1"
                      "status" "CANCELLED"})
                    "error")))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-participants"
                      "eventId" "e1"
                      "participants" [{"steamId" "p1"
                                       "displayName" "Alice"
                                       "seed" 1}
                                      {"steamId" "p2"
                                       "displayName" "Bob"
                                       "seed" 2}]})
                    "ok")))
        (is (= 2 (count (foreign-select-one (keypath "e1") participants))))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-placements"
                      "eventId" "e1"
                      "placements" [{"steamId" "p1"
                                     "displayName" "Alice"
                                     "placement" 1}]})
                    "ok")))
        (is (= 1 (get (first (foreign-select-one (keypath "e1") placements)) "placement")))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-snapshot"
                      "eventId" "e1"
                      "snapshot" {"stages" [{"name" "Main"
                                             "bracketFormat" "SINGLE_ELIM"}]}})
                    "ok")))
        (is (= "Main"
               (get (first (get (foreign-select-one (keypath "e1") snapshot) "stages"))
                    "name")))
        (is (= "event-not-found"
               (get (append-event!
                     depot
                     {"type" "set-status"
                      "eventId" "missing"
                      "status" "UPCOMING"})
                    "error")))))))
