(ns mge.tf.rama.divisions-module
  "Divisions — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *division-depot (hash-by divisionId):
    upsert-division

  PStates:
    $$divisions              {divisionId -> {name, regionId, signupCost, sortOrder}}
    $$division-ids-by-region {regionId -> {divisionId -> true}}   ;; list index per region"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn division-id [event]
  (get event "divisionId"))

(defn known-type? [t]
  (contains? #{"upsert-division"} t))

(defn upsert-error [division-id name region-id]
  (cond
    (or (nil? division-id) (= division-id "")) "missing-division-id"
    (or (nil? name) (= name "")) "missing-division-name"
    (or (nil? region-id) (= region-id "")) "missing-region-id"
    :else nil))

(defn long-or-zero [v]
  (long (if (nil? v) 0 v)))

(defmodule DivisionsModule
  [setup topologies]
  (declare-depot setup *division-depot (hash-by division-id))

  (let [s (stream-topology topologies "divisions")]
    (declare-pstate
     s $$divisions
     {String (fixed-keys-schema
              {"name" String
               "regionId" String
               "signupCost" Long
               "sortOrder" Long})})

    (declare-pstate
     s $$division-ids-by-region
     {String ;; regionId
      (map-schema String ;; divisionId
                  Boolean ;; presence marker
                  )})

    (<<sources s
      (source> *division-depot :> *event)
      (get *event "type" :> *type)

      (<<if (= *type "upsert-division")
        (get *event "divisionId" :> *division-id)
        (get *event "name" :> *name)
        (get *event "regionId" :> *region-id)
        (get *event "signupCost" :> *cost-raw)
        (get *event "sortOrder" :> *sort-raw)
        (upsert-error *division-id *name *region-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (long-or-zero *cost-raw :> *cost)
          (long-or-zero *sort-raw :> *sort)
          (local-transform>
           [(keypath *division-id)
            (multi-path
             [(keypath "name") (termval *name)]
             [(keypath "regionId") (termval *region-id)]
             [(keypath "signupCost") (termval *cost)]
             [(keypath "sortOrder") (termval *sort)])]
           $$divisions)
          ;; Repartition to regionId shard so all divisions for a region accumulate together.
          (|hash *region-id)
          (local-transform>
           [(keypath *region-id *division-id) (termval true)]
           $$division-ids-by-region)
          (ack-return> {"ok" true "divisionId" *division-id})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
