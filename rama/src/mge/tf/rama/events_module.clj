(ns mge.tf.rama.events-module
  "Events module — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *event-depot (hash-by eventId):
    create-event | update-event | set-status
    set-participants | set-placements | set-snapshot

  PStates:
    $$events              {eventId -> metadata fields}
    $$event-ids           {\"all\" -> {eventId -> true}}
    $$event-participants  {eventId -> vector of participant maps}
    $$event-placements    {eventId -> vector of placement maps}
    $$event-snapshot      {eventId -> Object}  ; opaque stages/matches JSON"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn event-id [event]
  (get event "eventId"))

(defn known-type? [t]
  (contains? #{"create-event" "update-event" "set-status"
               "set-participants" "set-placements" "set-snapshot"}
             t))

(defn valid-status? [status]
  (contains? #{"UPCOMING" "REGISTRATION" "IN_PROGRESS" "COMPLETED"} status))

(defn valid-type? [t]
  (contains? #{"CUP" "CHAMPIONSHIP" "FIGHT_NIGHT"} t))

(defn create-error [existing event-id name event-type]
  (cond
    (or (nil? event-id) (= event-id "")) "missing-event-id"
    (or (nil? name) (= name "")) "missing-event-name"
    (not (valid-type? event-type)) "invalid-event-type"
    (some? existing) "event-exists"
    :else nil))

(defn missing-event-error [event]
  (when (nil? event) "event-not-found"))

(defn status-error [event status]
  (or (missing-event-error event)
      (when-not (valid-status? status) "invalid-event-status")))

(defn update-error [event name]
  (or (missing-event-error event)
      (when (or (nil? name) (= name "")) "missing-event-name")))

(defn list-error [event items]
  (or (missing-event-error event)
      (when-not (vector? items) "invalid-list")))

(defn str-or-empty [v]
  (if (nil? v) "" v))

(defn bool-or [v default]
  (if (nil? v) default (boolean v)))

(defn as-vector [v]
  (cond
    (vector? v) v
    (sequential? v) (vec v)
    :else nil))

(defmodule EventsModule
  [setup topologies]
  (declare-depot setup *event-depot (hash-by event-id))

  (let [s (stream-topology topologies "events")]
    (declare-pstate
     s $$events
     {String (fixed-keys-schema
              {"name" String
               "type" String
               "status" String
               "isTeamEvent" Boolean
               "description" String
               "avatar" String
               "startedAt" String
               "endedAt" String
               "prizepool" String
               "bracketLink" String
               "card" String})})

    (declare-pstate
     s $$event-ids
     {String ;; "all"
      (map-schema String Boolean)})

    (declare-pstate
     s $$event-participants
     {String clojure.lang.PersistentVector})

    (declare-pstate
     s $$event-placements
     {String clojure.lang.PersistentVector})

    (declare-pstate
     s $$event-snapshot
     {String Object})

    (<<sources s
      (source> *event-depot :> *event)
      (get *event "type" :> *type)
      (get *event "eventId" :> *event-id)

      ;; ── create-event ────────────────────────────────────────────────
      (<<if (= *type "create-event")
        (get *event "name" :> *name)
        (get *event "eventType" :> *event-type)
        (get *event "isTeamEvent" :> *is-team-raw)
        (get *event "description" :> *description)
        (get *event "avatar" :> *avatar)
        (get *event "prizepool" :> *prizepool)
        (local-select> (keypath *event-id) $$events :> *existing)
        (create-error *existing *event-id *name *event-type :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (bool-or *is-team-raw false :> *is-team)
          (str-or-empty *description :> *desc-s)
          (str-or-empty *avatar :> *avatar-s)
          (str-or-empty *prizepool :> *prize-s)
          (local-transform>
           [(keypath *event-id)
            (multi-path
             [(keypath "name") (termval *name)]
             [(keypath "type") (termval *event-type)]
             [(keypath "status") (termval "UPCOMING")]
             [(keypath "isTeamEvent") (termval *is-team)]
             [(keypath "description") (termval *desc-s)]
             [(keypath "avatar") (termval *avatar-s)]
             [(keypath "startedAt") (termval "")]
             [(keypath "endedAt") (termval "")]
             [(keypath "prizepool") (termval *prize-s)]
             [(keypath "bracketLink") (termval "")]
             [(keypath "card") (termval "")])]
           $$events)
          (local-transform> [(keypath *event-id) (termval [])] $$event-participants)
          (local-transform> [(keypath *event-id) (termval [])] $$event-placements)
          (|hash "all")
          (local-transform>
           [(keypath "all" *event-id) (termval true)]
           $$event-ids)
          (ack-return> {"ok" true "eventId" *event-id "status" "UPCOMING"})))

      ;; ── update-event ────────────────────────────────────────────────
      (<<if (= *type "update-event")
        (get *event "name" :> *name)
        (get *event "description" :> *description)
        (get *event "avatar" :> *avatar)
        (get *event "startedAt" :> *started)
        (get *event "endedAt" :> *ended)
        (get *event "prizepool" :> *prizepool)
        (get *event "bracketLink" :> *bracket)
        (get *event "card" :> *card)
        (local-select> (keypath *event-id) $$events :> *existing)
        (update-error *existing *name :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (str-or-empty *description :> *desc-s)
          (str-or-empty *avatar :> *avatar-s)
          (str-or-empty *started :> *started-s)
          (str-or-empty *ended :> *ended-s)
          (str-or-empty *prizepool :> *prize-s)
          (str-or-empty *bracket :> *bracket-s)
          (str-or-empty *card :> *card-s)
          (local-transform>
           [(keypath *event-id)
            (multi-path
             [(keypath "name") (termval *name)]
             [(keypath "description") (termval *desc-s)]
             [(keypath "avatar") (termval *avatar-s)]
             [(keypath "startedAt") (termval *started-s)]
             [(keypath "endedAt") (termval *ended-s)]
             [(keypath "prizepool") (termval *prize-s)]
             [(keypath "bracketLink") (termval *bracket-s)]
             [(keypath "card") (termval *card-s)])]
           $$events)
          (ack-return> {"ok" true "eventId" *event-id})))

      ;; ── set-status ──────────────────────────────────────────────────
      (<<if (= *type "set-status")
        (get *event "status" :> *status)
        (local-select> (keypath *event-id) $$events :> *existing)
        (status-error *existing *status :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *event-id "status") (termval *status)]
           $$events)
          (ack-return> {"ok" true "eventId" *event-id "status" *status})))

      ;; ── set-participants (wholesale) ────────────────────────────────
      (<<if (= *type "set-participants")
        (get *event "participants" :> *raw)
        (as-vector *raw :> *items)
        (local-select> (keypath *event-id) $$events :> *existing)
        (list-error *existing *items :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *event-id) (termval *items)]
           $$event-participants)
          (ack-return> {"ok" true "eventId" *event-id})))

      ;; ── set-placements (wholesale) ──────────────────────────────────
      (<<if (= *type "set-placements")
        (get *event "placements" :> *raw)
        (as-vector *raw :> *items)
        (local-select> (keypath *event-id) $$events :> *existing)
        (list-error *existing *items :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *event-id) (termval *items)]
           $$event-placements)
          (ack-return> {"ok" true "eventId" *event-id})))

      ;; ── set-snapshot (opaque stages/matches JSON) ───────────────────
      (<<if (= *type "set-snapshot")
        (get *event "snapshot" :> *snapshot)
        (local-select> (keypath *event-id) $$events :> *existing)
        (missing-event-error *existing :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *event-id) (termval *snapshot)]
           $$event-snapshot)
          (ack-return> {"ok" true "eventId" *event-id})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
