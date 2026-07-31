(ns mge.tf.rama.match-module
  "Match spike — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *match-depot (hash-by matchId):
    create-match | ban-map | submit-score | set-schedule | set-match-status

  PStates: $$matches $$map-bans $$team-stats $$matches-by-team $$matches-by-week"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn match-id [event]
  (get event "matchId"))

(defn long-or-zero [v]
  (long (if (nil? v) 0 v)))

(defn str-or-empty [v]
  (if (nil? v) "" v))

(defn pool->set [pool]
  (set (or pool [])))

(defn week-key [season-id week-no]
  (str season-id ":" week-no))

(defn known-type? [t]
  (contains? #{"create-match" "ban-map" "submit-score"
               "set-schedule" "set-match-status"}
             t))

(defn ban-error [turn home away team-id remaining arena-id]
  (cond
    (nil? turn) "no-ban-state"
    (not= team-id (if (even? (long turn)) away home)) "not-your-turn"
    (not (contains? remaining arena-id)) "arena-not-in-pool"
    :else nil))

(defn score-error [status home-score away-score bo-games]
  (cond
    (nil? status) "match-not-found"
    (not= status "UNPLAYED") "already-played"
    (not (or (and (>= home-score bo-games) (> home-score away-score))
             (and (>= away-score bo-games) (> away-score home-score))))
    "incomplete-or-invalid-score"
    :else nil))

(defn match-status-error [status]
  (when-not (contains? #{"UNPLAYED" "PLAYED" "DISPUTE"} status)
    "invalid-match-status"))

(defn missing-match-error [field-err match]
  (or field-err (when (nil? match) "match-not-found")))

(defn pick-winner [home-id away-id home-score away-score]
  (if (> home-score away-score) home-id away-id))

(defn pick-loser [home-id away-id winner-id]
  (if (= winner-id home-id) away-id home-id))

(defmodule MatchModule
  [setup topologies]
  (declare-depot setup *match-depot (hash-by match-id))

  (let [s (stream-topology topologies "matches")]
    (declare-pstate
     s $$matches
     {String (fixed-keys-schema
              {"homeTeamId" String
               "awayTeamId" String
               "seasonId" String
               "status" String
               "homeScore" Long
               "awayScore" Long
               "winnerId" String
               "boGames" Long
               "weekNo" Long
               "seasonNo" Long
               "arenaId" String
               "matchDateTime" String
               "matchTimezone" String})})

    (declare-pstate
     s $$map-bans
     {String (fixed-keys-schema
              {"turn" Long
               "homeTeamId" String
               "awayTeamId" String
               "remaining" Object  ;; small set of arena ids
               "actions" Object})})  ;; vector of {teamId, arenaId}

    (declare-pstate
     s $$team-stats
     {String (fixed-keys-schema
              {"wins" Long
               "losses" Long
               "points" Long})})

    (declare-pstate
     s $$matches-by-team
     {String (map-schema String String {:subindex? true})})

    (declare-pstate
     s $$matches-by-week
     {String ;; "seasonId:weekNo"
      (map-schema String ;; matchId
                  Boolean)})

    (<<sources s
      (source> *match-depot :> *event)
      (get *event "type" :> *type)
      (get *event "matchId" :> *match-id)

      (<<if (= *type "create-match")
        (get *event "homeTeamId" :> *home-id)
        (get *event "awayTeamId" :> *away-id)
        (get *event "seasonId" :> *season-id)
        (get *event "boGames" :> *bo-raw)
        (get *event "pool" :> *pool)
        (get *event "weekNo" :> *week-raw)
        (get *event "seasonNo" :> *season-no-raw)
        (get *event "arenaId" :> *arena-raw)
        (get *event "matchDateTime" :> *dt-raw)
        (get *event "matchTimezone" :> *tz-raw)
        (long-or-zero *bo-raw :> *bo-games)
        (long-or-zero *week-raw :> *week-no)
        (long-or-zero *season-no-raw :> *season-no)
        (str-or-empty *arena-raw :> *arena-id)
        (str-or-empty *dt-raw :> *match-dt)
        (str-or-empty *tz-raw :> *match-tz)
        (pool->set *pool :> *pool-set)
        (week-key *season-id *week-no :> *wkey)
        (local-select> (keypath *match-id) $$matches :> *existing)
        (<<if (nil? *existing)
          (local-transform>
           [(keypath *match-id)
            (multi-path
             [(keypath "homeTeamId") (termval *home-id)]
             [(keypath "awayTeamId") (termval *away-id)]
             [(keypath "seasonId") (termval *season-id)]
             [(keypath "status") (termval "UNPLAYED")]
             [(keypath "homeScore") (termval 0)]
             [(keypath "awayScore") (termval 0)]
             [(keypath "winnerId") (termval "")]
             [(keypath "boGames") (termval *bo-games)]
             [(keypath "weekNo") (termval *week-no)]
             [(keypath "seasonNo") (termval *season-no)]
             [(keypath "arenaId") (termval *arena-id)]
             [(keypath "matchDateTime") (termval *match-dt)]
             [(keypath "matchTimezone") (termval *match-tz)])]
           $$matches)
          (local-transform>
           [(keypath *match-id)
            (multi-path
             [(keypath "turn") (termval 0)]
             [(keypath "homeTeamId") (termval *home-id)]
             [(keypath "awayTeamId") (termval *away-id)]
             [(keypath "remaining") (termval *pool-set)]
             [(keypath "actions") (termval [])])]
           $$map-bans)
          (|hash *home-id)
          (local-transform> [(keypath *home-id *match-id) (termval *season-id)] $$matches-by-team)
          (|hash *away-id)
          (local-transform> [(keypath *away-id *match-id) (termval *season-id)] $$matches-by-team)
          (|hash *wkey)
          (local-transform> [(keypath *wkey *match-id) (termval true)] $$matches-by-week)
          (ack-return> {"ok" true "matchId" *match-id})
         (else>)
          (ack-return> {"ok" false "error" "match-exists"})))

      (<<if (= *type "ban-map")
        (get *event "teamId" :> *team-id)
        (get *event "arenaId" :> *arena-id)
        (local-select> (keypath *match-id "turn") $$map-bans :> *turn)
        (local-select> (keypath *match-id "homeTeamId") $$map-bans :> *ban-home)
        (local-select> (keypath *match-id "awayTeamId") $$map-bans :> *ban-away)
        (local-select> (keypath *match-id "remaining") $$map-bans :> *remaining)
        (ban-error *turn *ban-home *ban-away *team-id *remaining *arena-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (disj *remaining *arena-id :> *next-remaining)
          (inc *turn :> *next-turn)
          (local-transform> [(keypath *match-id "remaining") (termval *next-remaining)] $$map-bans)
          (local-transform>
           [(keypath *match-id "actions") AFTER-ELEM
            (termval {"teamId" *team-id "arenaId" *arena-id})]
           $$map-bans)
          (local-transform> [(keypath *match-id "turn") (termval *next-turn)] $$map-bans)
          (ack-return> {"ok" true "matchId" *match-id "banned" *arena-id "turn" *next-turn})))

      (<<if (= *type "submit-score")
        (get *event "homeScore" :> *hs-raw)
        (get *event "awayScore" :> *as-raw)
        (long-or-zero *hs-raw :> *home-score)
        (long-or-zero *as-raw :> *away-score)
        (local-select> (keypath *match-id "status") $$matches :> *status)
        (local-select> (keypath *match-id "homeTeamId") $$matches :> *home-id)
        (local-select> (keypath *match-id "awayTeamId") $$matches :> *away-id)
        (local-select> (keypath *match-id "boGames") $$matches :> *bo-games)
        (score-error *status *home-score *away-score *bo-games :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (pick-winner *home-id *away-id *home-score *away-score :> *winner-id)
          (pick-loser *home-id *away-id *winner-id :> *loser-id)
          (local-transform>
           [(keypath *match-id)
            (multi-path
             [(keypath "status") (termval "PLAYED")]
             [(keypath "homeScore") (termval *home-score)]
             [(keypath "awayScore") (termval *away-score)]
             [(keypath "winnerId") (termval *winner-id)])]
           $$matches)
          (|hash *winner-id)
          (local-transform> [(keypath *winner-id "wins") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *winner-id "points") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *winner-id "losses") (nil->val 0) (term identity)] $$team-stats)
          (|hash *loser-id)
          (local-transform> [(keypath *loser-id "losses") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *loser-id "wins") (nil->val 0) (term identity)] $$team-stats)
          (local-transform> [(keypath *loser-id "points") (nil->val 0) (term identity)] $$team-stats)
          (ack-return> {"ok" true
                       "matchId" *match-id
                       "winnerId" *winner-id
                       "homeScore" *home-score
                       "awayScore" *away-score})))

      (<<if (= *type "set-schedule")
        (get *event "matchDateTime" :> *dt-raw)
        (get *event "matchTimezone" :> *tz-raw)
        (str-or-empty *dt-raw :> *match-dt)
        (str-or-empty *tz-raw :> *match-tz)
        (local-select> (keypath *match-id) $$matches :> *match)
        (missing-match-error nil *match :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *match-id)
            (multi-path
             [(keypath "matchDateTime") (termval *match-dt)]
             [(keypath "matchTimezone") (termval *match-tz)])]
           $$matches)
          (ack-return> {"ok" true "matchId" *match-id})))

      (<<if (= *type "set-match-status")
        (get *event "status" :> *status)
        (match-status-error *status :> *field-err)
        (local-select> (keypath *match-id) $$matches :> *match)
        (missing-match-error *field-err *match :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *match-id "status") (termval *status)]
           $$matches)
          (ack-return> {"ok" true "matchId" *match-id "status" *status})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
