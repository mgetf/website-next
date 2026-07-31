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
               "set-status" "set-member-permission"}
             t))

(defn status-error [status]
  (when-not (contains? #{"UNREADY" "PENDING" "READY" "DEAD" "PLACEMENT"} status)
    "invalid-status"))

(defn max-roster [format-id]
  (if (= format-id "1") 1 3))

(defn active-count [roster]
  (count (filter (fn [[_ m]] (true? (get m "active"))) (seq (or roster {})))))

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

(defn leave-error [team roster steam-id]
  (cond
    (nil? team) "team-not-found"
    (nil? (get roster steam-id)) "not-on-roster"
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
               "createdBy" String})})

    (declare-pstate
     s $$roster
     {String ;; teamId
      (map-schema String ;; steamId
                  (fixed-keys-schema
                   {"active" Boolean
                    "permissionLevel" String
                    "paymentStatus" String})
                  {:subindex? true})})

    (declare-pstate
     s $$player-season
     {String ;; steamId
      (map-schema String ;; seasonId
                  String ;; teamId
                  {:subindex? true})})

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
          (local-transform> [(keypath *team-id "name") (termval *name)] $$teams)
          (local-transform> [(keypath *team-id "acronym") (termval *acronym)] $$teams)
          (local-transform> [(keypath *team-id "formatId") (termval *format-id)] $$teams)
          (local-transform> [(keypath *team-id "seasonId") (termval *season-id)] $$teams)
          (local-transform> [(keypath *team-id "divisionId") (termval *division-id)] $$teams)
          (local-transform> [(keypath *team-id "regionId") (termval *region-id)] $$teams)
          (local-transform> [(keypath *team-id "status") (termval "UNREADY")] $$teams)
          (local-transform> [(keypath *team-id "createdBy") (termval *steam-id)] $$teams)
          (local-transform>
           [(keypath *team-id *steam-id)
            (multi-path
             [(keypath "active") (termval true)]
             [(keypath "permissionLevel") (termval "ADMIN")]
             [(keypath "paymentStatus") (termval "UNPAID")])]
           $$roster)
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

      ;; ── leave-team ──────────────────────────────────────────────────
      (<<if (= *type "leave-team")
        (get *event "steamId" :> *steam-id)
        (local-select> (keypath *team-id) $$teams :> *team)
        (local-select> (keypath *team-id) $$roster :> *roster)
        (leave-error *team *roster *steam-id :> *err)
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
          (local-transform>
           [(keypath *team-id "status") (termval *status)]
           $$teams)
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

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
