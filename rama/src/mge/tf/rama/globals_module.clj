(ns mge.tf.rama.globals-module
  "Site globals — announcements + audit log. REST JSON maps only.

  Depot *globals-depot (hash-by partition-key = announcementId|auditId|\"all\"):
    create-announcement | update-announcement | set-announcement-visible | delete-announcement
    append-audit

  PStates:
    $$announcements       {id -> {content, visible, createdAt}}
    $$announcement-ids    {\"all\" -> {id -> true}}
    $$visible-announcement-ids {\"all\" -> {id -> true}}
    $$audit-logs          {id -> audit fields}
    $$audit-ids           {\"all\" -> {id -> createdAt}}  ;; id -> timestamp for ordering"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn partition-key [event]
  (or (get event "announcementId")
      (get event "auditId")
      "all"))

(defn known-type? [t]
  (contains? #{"create-announcement" "update-announcement"
               "set-announcement-visible" "delete-announcement"
               "append-audit"}
             t))

(defn create-announcement-error [id content existing]
  (cond
    (or (nil? id) (= id "")) "missing-announcement-id"
    (or (nil? content) (= content "")) "missing-content"
    (some? existing) "announcement-exists"
    :else nil))

(defn missing-announcement-error [row]
  (when (nil? row) "announcement-not-found"))

(defn audit-error [id category action]
  (cond
    (or (nil? id) (= id "")) "missing-audit-id"
    (or (nil? category) (= category "")) "missing-category"
    (or (nil? action) (= action "")) "missing-action"
    :else nil))

(defn str-or-empty [v]
  (if (nil? v) "" (str v)))

(defn bool-or [v default]
  (if (nil? v) default (boolean v)))

(defmodule GlobalsModule
  [setup topologies]
  (declare-depot setup *globals-depot (hash-by partition-key))

  (let [s (stream-topology topologies "globals")]
    (declare-pstate
     s $$announcements
     {String (fixed-keys-schema
              {"content" String
               "visible" Boolean
               "createdAt" String})})

    (declare-pstate
     s $$announcement-ids
     {String ;; "all"
      (map-schema String Boolean)})

    (declare-pstate
     s $$visible-announcement-ids
     {String ;; "all"
      (map-schema String Boolean)})

    (declare-pstate
     s $$audit-logs
     {String (fixed-keys-schema
              {"actorId" String
               "actorRole" String
               "category" String
               "action" String
               "targetType" String
               "targetId" String
               "metadata" String
               "ipAddress" String
               "createdAt" String})})

    (declare-pstate
     s $$audit-ids
     {String ;; "all"
      (map-schema String String)}) ;; id -> createdAt

    (<<sources s
      (source> *globals-depot :> *event)
      (get *event "type" :> *type)

      ;; ── create-announcement ─────────────────────────────────────────
      (<<if (= *type "create-announcement")
        (get *event "announcementId" :> *id)
        (get *event "content" :> *content)
        (get *event "createdAt" :> *created-at)
        (local-select> (keypath *id) $$announcements :> *existing)
        (create-announcement-error *id *content *existing :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (str-or-empty *created-at :> *created)
          (local-transform>
           [(keypath *id)
            (multi-path
             [(keypath "content") (termval *content)]
             [(keypath "visible") (termval false)]
             [(keypath "createdAt") (termval *created)])]
           $$announcements)
          (|hash "all")
          (local-transform>
           [(keypath "all" *id) (termval true)]
           $$announcement-ids)
          (ack-return> {"ok" true "announcementId" *id "visible" false})))

      ;; ── update-announcement ─────────────────────────────────────────
      (<<if (= *type "update-announcement")
        (get *event "announcementId" :> *id)
        (get *event "content" :> *content)
        (local-select> (keypath *id) $$announcements :> *row)
        (missing-announcement-error *row :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *id "content") (termval *content)]
           $$announcements)
          (ack-return> {"ok" true "announcementId" *id})))

      ;; ── set-announcement-visible ────────────────────────────────────
      (<<if (= *type "set-announcement-visible")
        (get *event "announcementId" :> *id)
        (get *event "visible" :> *visible-raw)
        (bool-or *visible-raw false :> *visible)
        (local-select> (keypath *id) $$announcements :> *row)
        (missing-announcement-error *row :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *id "visible") (termval *visible)]
           $$announcements)
          (|hash "all")
          (<<if *visible
            (local-transform>
             [(keypath "all" *id) (termval true)]
             $$visible-announcement-ids)
           (else>)
            (local-transform>
             [(keypath "all" *id) NONE>]
             $$visible-announcement-ids))
          (ack-return> {"ok" true "announcementId" *id "visible" *visible})))

      ;; ── delete-announcement ─────────────────────────────────────────
      (<<if (= *type "delete-announcement")
        (get *event "announcementId" :> *id)
        (local-select> (keypath *id) $$announcements :> *row)
        (missing-announcement-error *row :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform> [(keypath *id) NONE>] $$announcements)
          (|hash "all")
          (local-transform>
           [(keypath "all" *id) NONE>]
           $$announcement-ids)
          (local-transform>
           [(keypath "all" *id) NONE>]
           $$visible-announcement-ids)
          (ack-return> {"ok" true "announcementId" *id})))

      ;; ── append-audit ────────────────────────────────────────────────
      (<<if (= *type "append-audit")
        (get *event "auditId" :> *id)
        (get *event "actorId" :> *actor-id)
        (get *event "actorRole" :> *actor-role)
        (get *event "category" :> *category)
        (get *event "action" :> *action)
        (get *event "targetType" :> *target-type)
        (get *event "targetId" :> *target-id)
        (get *event "metadata" :> *metadata)
        (get *event "ipAddress" :> *ip)
        (get *event "createdAt" :> *created-at)
        (audit-error *id *category *action :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (str-or-empty *actor-id :> *actor)
          (str-or-empty *actor-role :> *role)
          (str-or-empty *target-type :> *tt)
          (str-or-empty *target-id :> *tid)
          (str-or-empty *metadata :> *meta)
          (str-or-empty *ip :> *ip-s)
          (str-or-empty *created-at :> *created)
          (local-transform>
           [(keypath *id)
            (multi-path
             [(keypath "actorId") (termval *actor)]
             [(keypath "actorRole") (termval *role)]
             [(keypath "category") (termval *category)]
             [(keypath "action") (termval *action)]
             [(keypath "targetType") (termval *tt)]
             [(keypath "targetId") (termval *tid)]
             [(keypath "metadata") (termval *meta)]
             [(keypath "ipAddress") (termval *ip-s)]
             [(keypath "createdAt") (termval *created)])]
           $$audit-logs)
          (|hash "all")
          (local-transform>
           [(keypath "all" *id) (termval *created)]
           $$audit-ids)
          (ack-return> {"ok" true "auditId" *id})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
