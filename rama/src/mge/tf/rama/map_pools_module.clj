(ns mge.tf.rama.map-pools-module
  "Map pools + arenas — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *map-pool-depot (hash-by partition-key = poolId|arenaId):
    upsert-arena | create-pool | rename-pool | set-pool-active | set-pool-maps

  PStates:
    $$arenas     {arenaId -> {name, avatar, playoffMap}}
    $$pools      {poolId -> {name, isActive}}
    $$pool-maps  {poolId -> [arenaId ...]}  ; ordered list, replaced wholesale"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn partition-key [event]
  (or (get event "poolId") (get event "arenaId")))

(defn known-type? [t]
  (contains? #{"upsert-arena" "create-pool" "rename-pool"
               "set-pool-active" "set-pool-maps"}
             t))

(defn arena-error [arena-id name]
  (cond
    (or (nil? arena-id) (= arena-id "")) "missing-arena-id"
    (or (nil? name) (= name "")) "missing-arena-name"
    :else nil))

(defn create-pool-error [existing pool-id name]
  (cond
    (or (nil? pool-id) (= pool-id "")) "missing-pool-id"
    (or (nil? name) (= name "")) "missing-pool-name"
    (some? existing) "pool-exists"
    :else nil))

(defn missing-pool-error [pool]
  (when (nil? pool) "pool-not-found"))

(defn rename-error [pool name]
  (or (missing-pool-error pool)
      (when (or (nil? name) (= name "")) "missing-pool-name")))

(defn maps-error [pool arena-ids]
  (or (missing-pool-error pool)
      (when-not (vector? arena-ids) "invalid-arena-ids")))

(defn str-or-empty [v]
  (if (nil? v) "" v))

(defn bool-or [v default]
  (if (nil? v) default (boolean v)))

(defn long-or-zero [v]
  (long (if (nil? v) 0 v)))

(defn as-vector [v]
  (cond
    (vector? v) v
    (sequential? v) (vec v)
    :else nil))

(defmodule MapPoolsModule
  [setup topologies]
  (declare-depot setup *map-pool-depot (hash-by partition-key))

  (let [s (stream-topology topologies "map-pools")]
    (declare-pstate
     s $$arenas
     {String (fixed-keys-schema
              {"name" String
               "avatar" String
               "playoffMap" Long})})

    (declare-pstate
     s $$pools
     {String (fixed-keys-schema
              {"name" String
               "isActive" Boolean})})

    (declare-pstate
     s $$pool-maps
     {String clojure.lang.PersistentVector})

    (<<sources s
      (source> *map-pool-depot :> *event)
      (get *event "type" :> *type)

      ;; ── upsert-arena ────────────────────────────────────────────────
      (<<if (= *type "upsert-arena")
        (get *event "arenaId" :> *arena-id)
        (get *event "name" :> *name)
        (get *event "avatar" :> *avatar)
        (get *event "playoffMap" :> *playoff-raw)
        (arena-error *arena-id *name :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (str-or-empty *avatar :> *avatar-s)
          (long-or-zero *playoff-raw :> *playoff)
          (local-transform>
           [(keypath *arena-id)
            (multi-path
             [(keypath "name") (termval *name)]
             [(keypath "avatar") (termval *avatar-s)]
             [(keypath "playoffMap") (termval *playoff)])]
           $$arenas)
          (ack-return> {"ok" true "arenaId" *arena-id})))

      ;; ── create-pool ─────────────────────────────────────────────────
      (<<if (= *type "create-pool")
        (get *event "poolId" :> *pool-id)
        (get *event "name" :> *name)
        (local-select> (keypath *pool-id) $$pools :> *existing)
        (create-pool-error *existing *pool-id *name :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *pool-id)
            (multi-path
             [(keypath "name") (termval *name)]
             [(keypath "isActive") (termval false)])]
           $$pools)
          (local-transform>
           [(keypath *pool-id) (termval [])]
           $$pool-maps)
          (ack-return> {"ok" true "poolId" *pool-id})))

      ;; ── rename-pool ─────────────────────────────────────────────────
      (<<if (= *type "rename-pool")
        (get *event "poolId" :> *pool-id)
        (get *event "name" :> *name)
        (local-select> (keypath *pool-id) $$pools :> *pool)
        (rename-error *pool *name :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *pool-id "name") (termval *name)]
           $$pools)
          (ack-return> {"ok" true "poolId" *pool-id})))

      ;; ── set-pool-active ─────────────────────────────────────────────
      (<<if (= *type "set-pool-active")
        (get *event "poolId" :> *pool-id)
        (get *event "isActive" :> *active-raw)
        (local-select> (keypath *pool-id) $$pools :> *pool)
        (missing-pool-error *pool :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (bool-or *active-raw false :> *active)
          (local-transform>
           [(keypath *pool-id "isActive") (termval *active)]
           $$pools)
          (ack-return> {"ok" true "poolId" *pool-id "isActive" *active})))

      ;; ── set-pool-maps (replace ordered list wholesale) ──────────────
      (<<if (= *type "set-pool-maps")
        (get *event "poolId" :> *pool-id)
        (get *event "arenaIds" :> *arena-ids-raw)
        (as-vector *arena-ids-raw :> *arena-ids)
        (local-select> (keypath *pool-id) $$pools :> *pool)
        (maps-error *pool *arena-ids :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *pool-id) (termval *arena-ids)]
           $$pool-maps)
          (ack-return> {"ok" true "poolId" *pool-id})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
