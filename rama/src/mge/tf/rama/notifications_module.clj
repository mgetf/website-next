(ns mge.tf.rama.notifications-module
  "Notifications module — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *notification-depot (hash-by steamId):
    notify | mark-read | mark-all-read

  PStates:
    $$notifications  {steamId -> {id -> {type, body, href, read, createdAt}}}
    $$unread-count   {steamId -> Long}"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn steam-id [event]
  (get event "steamId"))

(defn known-type? [t]
  (contains? #{"notify" "mark-read" "mark-all-read"} t))

(defn notify-error [steam-id notif-id existing]
  (cond
    (or (nil? steam-id) (= steam-id "")) "missing-steam-id"
    (or (nil? notif-id) (= notif-id "")) "missing-notification-id"
    (some? existing) "notification-exists"
    :else nil))

(defn mark-read-error [notif]
  (cond
    (nil? notif) "notification-not-found"
    (true? (get notif "read")) "already-read"
    :else nil))

(defmodule NotificationsModule
  [setup topologies]
  (declare-depot setup *notification-depot (hash-by steam-id))

  (let [s (stream-topology topologies "notifications")]
    (declare-pstate
     s $$notifications
     {String
      (map-schema String
                  (fixed-keys-schema
                   {"type" String
                    "body" String
                    "href" String
                    "read" Boolean
                    "createdAt" String})
                  {:subindex? true})})

    (declare-pstate s $$unread-count {String Long})

    (<<sources s
      (source> *notification-depot :> *event)
      (get *event "type" :> *type)
      (get *event "steamId" :> *steam-id)

      (<<if (= *type "notify")
        (get *event "id" :> *id)
        (get *event "notifType" :> *notif-type)
        (get *event "body" :> *body)
        (get *event "href" :> *href)
        (get *event "createdAt" :> *created-at)
        (local-select> (keypath *steam-id *id) $$notifications :> *existing)
        (notify-error *steam-id *id *existing :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *steam-id *id)
            (multi-path
             [(keypath "type") (termval *notif-type)]
             [(keypath "body") (termval *body)]
             [(keypath "href") (termval *href)]
             [(keypath "read") (termval false)]
             [(keypath "createdAt") (termval *created-at)])]
           $$notifications)
          (local-transform>
           [(keypath *steam-id) (nil->val 0) (term inc)]
           $$unread-count)
          (ack-return> {"ok" true "steamId" *steam-id "id" *id})))

      (<<if (= *type "mark-read")
        (get *event "id" :> *id)
        (local-select> (keypath *steam-id *id) $$notifications :> *notif)
        (mark-read-error *notif :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *steam-id *id "read") (termval true)]
           $$notifications)
          (local-select>
           [(keypath *steam-id) (nil->val 0)]
           $$unread-count :> *count)
          (<<if (> *count 0)
            (dec *count :> *next)
            (local-transform>
             [(keypath *steam-id) (termval *next)]
             $$unread-count))
          (ack-return> {"ok" true "steamId" *steam-id "id" *id})))

      (<<if (= *type "mark-all-read")
        (local-transform> [(keypath *steam-id) (termval 0)] $$unread-count)
        (ack-return> {"ok" true "steamId" *steam-id "unread" 0}))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
