(ns mge.tf.rama.match-module
  "Match spike — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *match-depot (hash-by matchId):
    create-match | ban-map | submit-score | set-schedule | set-match-status
    set-arena | post-comm | request-reschedule | respond-reschedule

  PStates: $$matches $$map-bans $$team-stats $$matches-by-team
           $$matches-by-week $$matches-by-status $$match-comms $$pending-reschedule"
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
               "set-schedule" "set-match-status" "set-arena"
               "post-comm" "request-reschedule" "respond-reschedule"}
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

(defn pending-present? [pending-id]
  (and (some? pending-id) (not= pending-id "")))

(defn request-reschedule-error [match pending-id]
  (cond
    (nil? match) "match-not-found"
    (not= (get match "status") "UNPLAYED") "match-not-unplayed"
    (pending-present? pending-id) "pending-exists"
    :else nil))

(defn respond-reschedule-error [match pending-id comm-id response]
  (cond
    (nil? match) "match-not-found"
    (not (pending-present? pending-id)) "no-pending"
    (not= pending-id comm-id) "comm-mismatch"
    (not (contains? #{"accept" "deny" "cancel"} response)) "invalid-response"
    :else nil))

(defn response-status [response]
  (case response
    "accept" (long 1)
    "deny" (long 2)
    "cancel" (long 3)
    (long 3)))

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
               "matchTimezone" String
               "submittedAt" String
               "submittedBy" String})})

    (declare-pstate
     s $$map-bans
     {String (fixed-keys-schema
              {"turn" Long
               "homeTeamId" String
               "awayTeamId" String
               "remaining" Object
               "actions" Object})})

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
     {String (map-schema String Boolean)})

    (declare-pstate
     s $$matches-by-status
     {String (map-schema String Boolean)})

    (declare-pstate
     s $$match-comms
     {String ;; matchId
      (map-schema String ;; commId
                  (fixed-keys-schema
                   {"owner" String
                    "content" String
                    "createdAt" String
                    "reschedule" String
                    "rescheduleStatus" Long})
                  {:subindex? true})})

    (declare-pstate
     s $$pending-reschedule
     {String String}) ;; matchId -> commId ("" when none)

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
             [(keypath "matchTimezone") (termval *match-tz)]
             [(keypath "submittedAt") (termval "")]
             [(keypath "submittedBy") (termval "")])]
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
          (local-transform> [(keypath *match-id) (termval "")] $$pending-reschedule)
          (|hash *home-id)
          (local-transform> [(keypath *home-id *match-id) (termval *season-id)] $$matches-by-team)
          (|hash *away-id)
          (local-transform> [(keypath *away-id *match-id) (termval *season-id)] $$matches-by-team)
          (|hash *wkey)
          (local-transform> [(keypath *wkey *match-id) (termval true)] $$matches-by-week)
          (|hash "UNPLAYED")
          (local-transform> [(keypath "UNPLAYED" *match-id) (termval true)] $$matches-by-status)
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
        (get *event "submittedBy" :> *submitted-by-raw)
        (get *event "submittedAt" :> *submitted-at-raw)
        (long-or-zero *hs-raw :> *home-score)
        (long-or-zero *as-raw :> *away-score)
        (str-or-empty *submitted-by-raw :> *submitted-by)
        (str-or-empty *submitted-at-raw :> *submitted-at)
        (local-select> (keypath *match-id "status") $$matches :> *status)
        (local-select> (keypath *match-id "homeTeamId") $$matches :> *home-id)
        (local-select> (keypath *match-id "awayTeamId") $$matches :> *away-id)
        (local-select> (keypath *match-id "boGames") $$matches :> *bo-games)
        (local-select> (keypath *match-id) $$pending-reschedule :> *pending-id)
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
             [(keypath "winnerId") (termval *winner-id)]
             [(keypath "submittedAt") (termval *submitted-at)]
             [(keypath "submittedBy") (termval *submitted-by)])]
           $$matches)
          (|hash "UNPLAYED")
          (local-transform> [(keypath "UNPLAYED" *match-id) NONE>] $$matches-by-status)
          (|hash "PLAYED")
          (local-transform> [(keypath "PLAYED" *match-id) (termval true)] $$matches-by-status)
          (|hash *winner-id)
          (local-transform> [(keypath *winner-id "wins") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *winner-id "points") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *winner-id "losses") (nil->val 0) (term identity)] $$team-stats)
          (|hash *loser-id)
          (local-transform> [(keypath *loser-id "losses") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *loser-id "wins") (nil->val 0) (term identity)] $$team-stats)
          (local-transform> [(keypath *loser-id "points") (nil->val 0) (term identity)] $$team-stats)
          (<<if (pending-present? *pending-id)
            (local-transform>
             [(keypath *match-id *pending-id "rescheduleStatus") (termval (long 3))]
             $$match-comms)
            (local-transform> [(keypath *match-id) (termval "")] $$pending-reschedule))
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

      (<<if (= *type "set-arena")
        (get *event "arenaId" :> *arena-raw)
        (str-or-empty *arena-raw :> *arena-id)
        (local-select> (keypath *match-id) $$matches :> *match)
        (missing-match-error nil *match :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *match-id "arenaId") (termval *arena-id)]
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
          (get *match "status" :> *old-status)
          (local-transform>
           [(keypath *match-id "status") (termval *status)]
           $$matches)
          (|hash *old-status)
          (local-transform> [(keypath *old-status *match-id) NONE>] $$matches-by-status)
          (|hash *status)
          (local-transform> [(keypath *status *match-id) (termval true)] $$matches-by-status)
          (ack-return> {"ok" true "matchId" *match-id "status" *status})))

      (<<if (= *type "post-comm")
        (get *event "commId" :> *comm-id)
        (get *event "owner" :> *owner-raw)
        (get *event "content" :> *content-raw)
        (get *event "createdAt" :> *created-raw)
        (str-or-empty *owner-raw :> *owner)
        (str-or-empty *content-raw :> *content)
        (str-or-empty *created-raw :> *created-at)
        (local-select> (keypath *match-id) $$matches :> *match)
        (missing-match-error nil *match :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *match-id *comm-id)
            (multi-path
             [(keypath "owner") (termval *owner)]
             [(keypath "content") (termval *content)]
             [(keypath "createdAt") (termval *created-at)]
             [(keypath "reschedule") (termval "")]
             [(keypath "rescheduleStatus") (termval (long -1))])]
           $$match-comms)
          (ack-return> {"ok" true "matchId" *match-id "commId" *comm-id})))

      (<<if (= *type "request-reschedule")
        (get *event "commId" :> *comm-id)
        (get *event "owner" :> *owner-raw)
        (get *event "content" :> *content-raw)
        (get *event "createdAt" :> *created-raw)
        (get *event "reschedule" :> *reschedule-raw)
        (str-or-empty *owner-raw :> *owner)
        (str-or-empty *content-raw :> *content)
        (str-or-empty *created-raw :> *created-at)
        (str-or-empty *reschedule-raw :> *reschedule)
        (local-select> (keypath *match-id) $$matches :> *match)
        (local-select> (keypath *match-id) $$pending-reschedule :> *pending-id)
        (request-reschedule-error *match *pending-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *match-id *comm-id)
            (multi-path
             [(keypath "owner") (termval *owner)]
             [(keypath "content") (termval *content)]
             [(keypath "createdAt") (termval *created-at)]
             [(keypath "reschedule") (termval *reschedule)]
             [(keypath "rescheduleStatus") (termval (long 0))])]
           $$match-comms)
          (local-transform> [(keypath *match-id) (termval *comm-id)] $$pending-reschedule)
          (ack-return> {"ok" true "matchId" *match-id "commId" *comm-id})))

      (<<if (= *type "respond-reschedule")
        (get *event "commId" :> *comm-id)
        (get *event "response" :> *response)
        (get *event "respondedBy" :> *responded-by-raw)
        (get *event "responseCommId" :> *resp-comm-id)
        (get *event "responseContent" :> *resp-content-raw)
        (get *event "createdAt" :> *created-raw)
        (str-or-empty *responded-by-raw :> *responded-by)
        (str-or-empty *resp-content-raw :> *resp-content)
        (str-or-empty *created-raw :> *created-at)
        (local-select> (keypath *match-id) $$matches :> *match)
        (local-select> (keypath *match-id) $$pending-reschedule :> *pending-id)
        (respond-reschedule-error *match *pending-id *comm-id *response :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (response-status *response :> *new-status)
          (local-select>
           (keypath *match-id *comm-id "reschedule") $$match-comms :> *proposed)
          (local-transform>
           [(keypath *match-id *comm-id "rescheduleStatus") (termval *new-status)]
           $$match-comms)
          (local-transform> [(keypath *match-id) (termval "")] $$pending-reschedule)
          (local-transform>
           [(keypath *match-id *resp-comm-id)
            (multi-path
             [(keypath "owner") (termval *responded-by)]
             [(keypath "content") (termval *resp-content)]
             [(keypath "createdAt") (termval *created-at)]
             [(keypath "reschedule") (termval "")]
             [(keypath "rescheduleStatus") (termval (long -1))])]
           $$match-comms)
          (<<if (= *response "accept")
            (local-transform>
             [(keypath *match-id "matchDateTime") (termval *proposed)]
             $$matches))
          (ack-return> {"ok" true "matchId" *match-id "commId" *comm-id "status" *response})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
