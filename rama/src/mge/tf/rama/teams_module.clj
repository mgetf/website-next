(ns mge.tf.rama.teams-module
  "Teams module — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *team-depot (hash-by teamId):
    create-team | join-team | leave-team | set-status | set-member-permission

  PStates:
    $$teams            {teamId -> team fields}
    $$roster           {teamId -> {steamId -> member fields}}
    $$player-season    {steamId -> {seasonId -> teamId}}  ; uniqueness"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn team-id [event]
  (get event "teamId"))

(defn known-type? [t]
  (contains? #{"create-team" "join-team" "leave-team"
               "set-status" "set-member-permission" "set-member-payment"
               "request-join" "approve-pending" "decline-pending"
               "create-invite" "accept-invite"}
             t))

(defn payment-status-error [status]
  (when-not (contains? #{"UNPAID" "PAID" "EXEMPT"} status)
    "invalid-payment-status"))

(defn status-error [status]
  (when-not (contains? #{"UNREADY" "PENDING" "READY" "DEAD" "PLACEMENT"} status)
    "invalid-status"))

(defn max-roster [format-id]
  (if (= format-id "1") 1 3))

(defn active-count [roster]
  (count (filter (fn [[_ m]] (true? (get m "active"))) (seq (or roster {})))))

(defn pending-key [team-id steam-id]
  (str team-id ":" steam-id))

(defn awaiting-status []
  (long 1))

(defn invite-status []
  (long 0))

(defn join-password-or-empty [v]
  (if (nil? v) "" v))

(defn create-invite-error [team roster steam-id pending-row]
  (cond
    (nil? team) "team-not-found"
    (= (get team "status") "DEAD") "team-dead"
    (and (some? (get roster steam-id))
         (true? (get (get roster steam-id) "active")))
    "already-on-roster"
    (some? pending-row) "pending-exists"
    :else nil))

(defn accept-invite-error [pending-row]
  (cond
    (nil? pending-row) "pending-not-found"
    (not= (long (get pending-row "status")) 0) "pending-not-invite"
    :else nil))

(defn create-error [existing creator-slot]
  (cond
    (some? existing) "team-exists"
    (some? creator-slot) "player-already-on-team"
    :else nil))

(defn join-error [team roster steam-id player-slot format-id]
  (cond
    (nil? team) "team-not-found"
    (= (get team "status") "DEAD") "team-dead"
    (some? player-slot) "player-already-on-team"
    (some? (get roster steam-id)) "already-on-roster"
    (>= (active-count roster) (max-roster format-id)) "roster-full"
    :else nil))

(defn request-join-error [team roster steam-id player-slot format-id]
  (join-error team roster steam-id player-slot format-id))

(defn approve-error [team roster steam-id player-slot format-id pending-row]
  (cond
    (nil? pending-row) "pending-not-found"
    (not= (long (get pending-row "status")) 1) "pending-not-awaiting"
    :else (join-error team roster steam-id player-slot format-id)))

(defn decline-error [pending-row]
  (when (nil? pending-row) "pending-not-found"))

(defn leave-error [team member]
  (cond
    (nil? team) "team-not-found"
    (nil? member) "not-on-roster"
    :else nil))

(defn member-perm-error [level]
  (when-not (contains? #{"MEMBER" "ADMIN" "STATUS"} level)
    "invalid-member-permission"))

(defn missing-team-error [field-err team]
  (or field-err (when (nil? team) "team-not-found")))

(defn missing-member-error [field-err member]
  (or field-err (when (nil? member) "not-on-roster")))

(defmodule TeamsModule
  [setup topologies]
  (declare-depot setup *team-depot (hash-by team-id))

  (let [s (stream-topology topologies "teams")]
    (declare-pstate
     s $$teams
     {String (fixed-keys-schema
              {"name" String
               "acronym" String
               "formatId" String
               "seasonId" String
               "divisionId" String
               "regionId" String
               "status" String
               "createdBy" String
               "joinPassword" String})})

    ;; Roster/pending stay non-subindexed: max 3 players, and dataflow
    ;; `local-select>` of a whole subindexed map does not seq like a Clojure map
    ;; (breaks active-count / leave-error `(get roster steamId)`).
    (declare-pstate
     s $$roster
     {String ;; teamId
      (map-schema String ;; steamId
                  (fixed-keys-schema
                   {"active" Boolean
                    "permissionLevel" String
                    "paymentStatus" String}))})

    (declare-pstate
     s $$player-season
     {String ;; steamId
      (map-schema String ;; seasonId
                  String ;; teamId
                  {:subindex? true})})

    (declare-pstate
     s $$pending
     {String ;; teamId
      (map-schema String ;; steamId
                  (fixed-keys-schema
                   {"status" Long}))})

    (declare-pstate
     s $$pending-by-player
     {String ;; steamId
      (map-schema String ;; teamId
                  Long)})

    (declare-pstate
     s $$pending-awaiting
     {String ;; "all"
      (map-schema String ;; "teamId:steamId"
                  Boolean)})

    (declare-pstate
     s $$team-ids-by-season
     {String ;; seasonId
      (map-schema String ;; teamId
                  String ;; status
                  )})

    (<<sources s
      (source> *team-depot :> *event)
      (get *event "type" :> *type)
      (get *event "teamId" :> *team-id)

      ;; ── create-team ─────────────────────────────────────────────────
      (<<if (= *type "create-team")
        (get *event "steamId" :> *steam-id)
        (get *event "name" :> *name)
        (get *event "acronym" :> *acronym)
        (get *event "formatId" :> *format-id)
        (get *event "seasonId" :> *season-id)
        (get *event "divisionId" :> *division-id)
        (get *event "regionId" :> *region-id)
        (get *event "joinPassword" :> *join-password-raw)
        (join-password-or-empty *join-password-raw :> *join-password)
        (local-select> (keypath *team-id) $$teams :> *existing)
        ;; uniqueness lives on steamId partition
        (|hash *steam-id)
        (local-select> (keypath *steam-id *season-id) $$player-season :> *creator-slot)
        (create-error *existing *creator-slot :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *steam-id *season-id) (termval *team-id)]
           $$player-season)
          (|hash *team-id)
          (local-transform>
           [(keypath *team-id)
            (multi-path
             [(keypath "name") (termval *name)]
             [(keypath "acronym") (termval *acronym)]
             [(keypath "formatId") (termval *format-id)]
             [(keypath "seasonId") (termval *season-id)]
             [(keypath "divisionId") (termval *division-id)]
             [(keypath "regionId") (termval *region-id)]
             [(keypath "status") (termval "UNREADY")]
             [(keypath "createdBy") (termval *steam-id)]
             [(keypath "joinPassword") (termval *join-password)])]
           $$teams)
          (local-transform>
           [(keypath *team-id *steam-id)
            (multi-path
             [(keypath "active") (termval true)]
             [(keypath "permissionLevel") (termval "STATUS")]
             [(keypath "paymentStatus") (termval "UNPAID")])]
           $$roster)
          (|hash *season-id)
          (local-transform>
           [(keypath *season-id *team-id) (termval "UNREADY")]
           $$team-ids-by-season)
          (ack-return> {"ok" true "teamId" *team-id "steamId" *steam-id})))

      ;; ── join-team ───────────────────────────────────────────────────
      (<<if (= *type "join-team")
        (get *event "steamId" :> *steam-id)
        (local-select> (keypath *team-id) $$teams :> *team)
        (local-select> (keypath *team-id) $$roster :> *roster)
        (get *team "seasonId" :> *season-id)
        (get *team "formatId" :> *format-id)
        (|hash *steam-id)
        (local-select> (keypath *steam-id *season-id) $$player-season :> *player-slot)
        (join-error *team *roster *steam-id *player-slot *format-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *steam-id *season-id) (termval *team-id)]
           $$player-season)
          (|hash *team-id)
          (local-transform>
           [(keypath *team-id *steam-id)
            (multi-path
             [(keypath "active") (termval true)]
             [(keypath "permissionLevel") (termval "MEMBER")]
             [(keypath "paymentStatus") (termval "UNPAID")])]
           $$roster)
          (ack-return> {"ok" true "teamId" *team-id "steamId" *steam-id})))

      ;; ── request-join → pending awaiting-admin ───────────────────────
      (<<if (= *type "request-join")
        (get *event "steamId" :> *steam-id)
        (local-select> (keypath *team-id) $$teams :> *team)
        (local-select> (keypath *team-id) $$roster :> *roster)
        (get *team "seasonId" :> *season-id)
        (get *team "formatId" :> *format-id)
        (|hash *steam-id)
        (local-select> (keypath *steam-id *season-id) $$player-season :> *player-slot)
        (request-join-error *team *roster *steam-id *player-slot *format-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (pending-key *team-id *steam-id :> *pkey)
          (awaiting-status :> *st)
          (|hash *team-id)
          (local-transform>
           [(keypath *team-id *steam-id "status") (termval *st)]
           $$pending)
          (|hash *steam-id)
          (local-transform>
           [(keypath *steam-id *team-id) (termval *st)]
           $$pending-by-player)
          (|hash "all")
          (local-transform>
           [(keypath "all" *pkey) (termval true)]
           $$pending-awaiting)
          (ack-return> {"ok" true "teamId" *team-id "steamId" *steam-id})))

      ;; ── approve-pending → roster + clear pending ────────────────────
      (<<if (= *type "approve-pending")
        (get *event "steamId" :> *steam-id)
        (local-select> (keypath *team-id) $$teams :> *team)
        (local-select> (keypath *team-id) $$roster :> *roster)
        (local-select> (keypath *team-id *steam-id) $$pending :> *pending-row)
        (get *team "seasonId" :> *season-id)
        (get *team "formatId" :> *format-id)
        (|hash *steam-id)
        (local-select> (keypath *steam-id *season-id) $$player-season :> *player-slot)
        (approve-error *team *roster *steam-id *player-slot *format-id *pending-row :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (pending-key *team-id *steam-id :> *pkey)
          (local-transform>
           [(keypath *steam-id *season-id) (termval *team-id)]
           $$player-season)
          (local-transform>
           [(keypath *steam-id *team-id) NONE>]
           $$pending-by-player)
          (|hash *team-id)
          (local-transform>
           [(keypath *team-id *steam-id)
            (multi-path
             [(keypath "active") (termval true)]
             [(keypath "permissionLevel") (termval "MEMBER")]
             [(keypath "paymentStatus") (termval "UNPAID")])]
           $$roster)
          (local-transform>
           [(keypath *team-id *steam-id) NONE>]
           $$pending)
          (|hash "all")
          (local-transform>
           [(keypath "all" *pkey) NONE>]
           $$pending-awaiting)
          (ack-return> {"ok" true "teamId" *team-id "steamId" *steam-id})))

      ;; ── decline-pending → clear pending ─────────────────────────────
      (<<if (= *type "decline-pending")
        (get *event "steamId" :> *steam-id)
        (local-select> (keypath *team-id *steam-id) $$pending :> *pending-row)
        (decline-error *pending-row :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (pending-key *team-id *steam-id :> *pkey)
          (local-transform>
           [(keypath *team-id *steam-id) NONE>]
           $$pending)
          (|hash *steam-id)
          (local-transform>
           [(keypath *steam-id *team-id) NONE>]
           $$pending-by-player)
          (|hash "all")
          (local-transform>
           [(keypath "all" *pkey) NONE>]
           $$pending-awaiting)
          (ack-return> {"ok" true "teamId" *team-id "steamId" *steam-id})))

      ;; ── create-invite → pending status=0 (Steam invite) ─────────────
      (<<if (= *type "create-invite")
        (get *event "steamId" :> *steam-id)
        (local-select> (keypath *team-id) $$teams :> *team)
        (local-select> (keypath *team-id) $$roster :> *roster)
        (local-select> (keypath *team-id *steam-id) $$pending :> *pending-row)
        (create-invite-error *team *roster *steam-id *pending-row :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (invite-status :> *st)
          (local-transform>
           [(keypath *team-id *steam-id "status") (termval *st)]
           $$pending)
          (|hash *steam-id)
          (local-transform>
           [(keypath *steam-id *team-id) (termval *st)]
           $$pending-by-player)
          (ack-return> {"ok" true "teamId" *team-id "steamId" *steam-id})))

      ;; ── accept-invite → pending 0→1 + awaiting index ────────────────
      (<<if (= *type "accept-invite")
        (get *event "steamId" :> *steam-id)
        (local-select> (keypath *team-id *steam-id) $$pending :> *pending-row)
        (accept-invite-error *pending-row :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (pending-key *team-id *steam-id :> *pkey)
          (awaiting-status :> *st)
          (local-transform>
           [(keypath *team-id *steam-id "status") (termval *st)]
           $$pending)
          (|hash *steam-id)
          (local-transform>
           [(keypath *steam-id *team-id) (termval *st)]
           $$pending-by-player)
          (|hash "all")
          (local-transform>
           [(keypath "all" *pkey) (termval true)]
           $$pending-awaiting)
          (ack-return> {"ok" true "teamId" *team-id "steamId" *steam-id})))

      ;; ── leave-team ──────────────────────────────────────────────────
      (<<if (= *type "leave-team")
        (get *event "steamId" :> *steam-id)
        (local-select> (keypath *team-id) $$teams :> *team)
        (local-select> (keypath *team-id *steam-id) $$roster :> *member)
        (leave-error *team *member :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (get *team "seasonId" :> *season-id)
          (local-transform>
           [(keypath *team-id *steam-id) NONE>]
           $$roster)
          (|hash *steam-id)
          (local-transform>
           [(keypath *steam-id *season-id) NONE>]
           $$player-season)
          (ack-return> {"ok" true "teamId" *team-id "steamId" *steam-id})))

      ;; ── set-status ──────────────────────────────────────────────────
      (<<if (= *type "set-status")
        (get *event "status" :> *status)
        (status-error *status :> *field-err)
        (local-select> (keypath *team-id) $$teams :> *team)
        (missing-team-error *field-err *team :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (get *team "seasonId" :> *season-id)
          (local-transform>
           [(keypath *team-id "status") (termval *status)]
           $$teams)
          (|hash *season-id)
          (local-transform>
           [(keypath *season-id *team-id) (termval *status)]
           $$team-ids-by-season)
          (ack-return> {"ok" true "teamId" *team-id "status" *status})))

      ;; ── set-member-permission ───────────────────────────────────────
      (<<if (= *type "set-member-permission")
        (get *event "steamId" :> *steam-id)
        (get *event "permissionLevel" :> *level)
        (member-perm-error *level :> *field-err)
        (local-select> (keypath *team-id *steam-id) $$roster :> *member)
        (missing-member-error *field-err *member :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *team-id *steam-id "permissionLevel") (termval *level)]
           $$roster)
          (ack-return> {"ok" true
                       "teamId" *team-id
                       "steamId" *steam-id
                       "permissionLevel" *level})))

      ;; ── set-member-payment ──────────────────────────────────────────
      (<<if (= *type "set-member-payment")
        (get *event "steamId" :> *steam-id)
        (get *event "paymentStatus" :> *pay-status)
        (payment-status-error *pay-status :> *field-err)
        (local-select> (keypath *team-id *steam-id) $$roster :> *member)
        (missing-member-error *field-err *member :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *team-id *steam-id "paymentStatus") (termval *pay-status)]
           $$roster)
          (ack-return> {"ok" true
                       "teamId" *team-id
                       "steamId" *steam-id
                       "paymentStatus" *pay-status})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
