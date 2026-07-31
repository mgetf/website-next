(ns mge.tf.rama.match-module-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.match-module :as mm]))

(def MODULE-NAME "mge.tf.rama.match-module/MatchModule")

(defn append-event!
  [depot event]
  (get (foreign-append! depot event) "matches"))

(deftest match-lifecycle-test
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc mm/MatchModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*match-depot")
          matches (foreign-pstate ipc MODULE-NAME "$$matches")
          map-bans (foreign-pstate ipc MODULE-NAME "$$map-bans")
          team-stats (foreign-pstate ipc MODULE-NAME "$$team-stats")
          by-team (foreign-pstate ipc MODULE-NAME "$$matches-by-team")
          pool ["process" "discard" "viggle" "asa" "product"]
          create-ack (append-event!
                      depot
                      {"type" "create-match"
                       "matchId" "m1"
                       "homeTeamId" "home"
                       "awayTeamId" "away"
                       "seasonId" "s1"
                       "boGames" 2
                       "pool" pool})]

      (testing "create-match"
        (is (= true (get create-ack "ok")))
        (is (= "UNPLAYED" (foreign-select-one (keypath "m1" "status") matches)))
        (is (= "home" (foreign-select-one (keypath "m1" "homeTeamId") matches)))
        (is (= 0 (foreign-select-one (keypath "m1" "turn") map-bans)))
        (is (= (set pool)
               (foreign-select-one (keypath "m1" "remaining") map-bans)))
        (is (= "s1" (foreign-select-one (keypath "home" "m1") by-team)))
        (is (= "s1" (foreign-select-one (keypath "away" "m1") by-team)))
        (is (= "match-exists"
               (get (append-event!
                     depot
                     {"type" "create-match"
                      "matchId" "m1"
                      "homeTeamId" "home"
                      "awayTeamId" "away"
                      "seasonId" "s1"
                      "boGames" 2
                      "pool" pool})
                    "error"))))

      (testing "map bans"
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
        (is (= true
               (get (append-event!
                     depot
                     {"type" "ban-map"
                      "matchId" "m1"
                      "teamId" "home"
                      "arenaId" "discard"})
                    "ok")))
        (is (= 2 (foreign-select-one (keypath "m1" "turn") map-bans)))
        (is (= [{"teamId" "away" "arenaId" "process"}
                {"teamId" "home" "arenaId" "discard"}]
               (foreign-select-one (keypath "m1" "actions") map-bans))))

      (testing "submit-score"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "submit-score"
                      "matchId" "m1"
                      "homeScore" 2
                      "awayScore" 0})
                    "ok")))
        (is (= "PLAYED" (foreign-select-one (keypath "m1" "status") matches)))
        (is (= "home" (foreign-select-one (keypath "m1" "winnerId") matches)))
        (is (= 1 (foreign-select-one (keypath "home" "wins") team-stats)))
        (is (= 1 (foreign-select-one (keypath "home" "points") team-stats)))
        (is (= 1 (foreign-select-one (keypath "away" "losses") team-stats)))
        (is (= "already-played"
               (get (append-event!
                     depot
                     {"type" "submit-score"
                      "matchId" "m1"
                      "homeScore" 2
                      "awayScore" 1})
                    "error")))))))
