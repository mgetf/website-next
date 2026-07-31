(ns mge.tf.rama.notifications-module-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.notifications-module :as nm]))

(def MODULE-NAME "mge.tf.rama.notifications-module/NotificationsModule")

(defn append-event!
  [depot event]
  (get (foreign-append! depot event) "notifications"))

(deftest notifications-lifecycle-test
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc nm/NotificationsModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*notification-depot")
          notifs (foreign-pstate ipc MODULE-NAME "$$notifications")
          unread (foreign-pstate ipc MODULE-NAME "$$unread-count")]

      (testing "notify increments unread"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "notify"
                      "steamId" "p1"
                      "id" "n1"
                      "notifType" "MATCH"
                      "body" "Score submitted"
                      "href" "/matches/1"
                      "createdAt" "2026-01-01T00:00:00Z"})
                    "ok")))
        (is (= 1 (foreign-select-one (keypath "p1") unread)))
        (is (= false (foreign-select-one (keypath "p1" "n1" "read") notifs)))
        (append-event!
         depot
         {"type" "notify"
          "steamId" "p1"
          "id" "n2"
          "notifType" "TEAM"
          "body" "Joined"
          "href" "/teams/1"
          "createdAt" "2026-01-01T00:01:00Z"})
        (is (= 2 (foreign-select-one (keypath "p1") unread))))

      (testing "mark-read decrements"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "mark-read" "steamId" "p1" "id" "n1"})
                    "ok")))
        (is (= true (foreign-select-one (keypath "p1" "n1" "read") notifs)))
        (is (= 1 (foreign-select-one (keypath "p1") unread)))
        (is (= "already-read"
               (get (append-event!
                     depot
                     {"type" "mark-read" "steamId" "p1" "id" "n1"})
                    "error"))))

      (testing "mark-all-read zeros counter"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "mark-all-read" "steamId" "p1"})
                    "ok")))
        (is (= 0 (foreign-select-one (keypath "p1") unread)))))))
