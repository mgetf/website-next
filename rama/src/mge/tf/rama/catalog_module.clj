(ns mge.tf.rama.catalog-module
  "Regions / formats / active signup seasons — REST JSON maps only.

  Depot *catalog-depot (hash-by partition-key = regionId|formatId|code):
    upsert-region | set-region-hidden
    upsert-format
    set-active-signup

  PStates:
    $$regions         {regionId -> {name, hidden, currencySymbol, currencyCode}}
    $$formats         {formatId -> {name, code}}
    $$format-by-code  {code -> formatId}
    $$active-signup   {regionId -> {formatId -> seasonId}}"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn partition-key [event]
  (or (get event "regionId")
      (get event "formatId")
      (get event "code")))

(defn known-type? [t]
  (contains? #{"upsert-region" "set-region-hidden"
               "upsert-format" "set-active-signup"}
             t))

(defn region-error [region-id name]
  (cond
    (or (nil? region-id) (= region-id "")) "missing-region-id"
    (or (nil? name) (= name "")) "missing-region-name"
    :else nil))

(defn format-error [format-id name code]
  (cond
    (or (nil? format-id) (= format-id "")) "missing-format-id"
    (or (nil? name) (= name "")) "missing-format-name"
    (or (nil? code) (= code "")) "missing-format-code"
    :else nil))

(defn format-code-taken-error [taken-by format-id]
  (when (and (some? taken-by) (not= taken-by format-id))
    "format-code-taken"))

(defn active-signup-error [region-id format-id season-id]
  (cond
    (or (nil? region-id) (= region-id "")) "missing-region-id"
    (or (nil? format-id) (= format-id "")) "missing-format-id"
    (or (nil? season-id) (= season-id "")) "missing-season-id"
    :else nil))

(defn str-or-empty [v]
  (if (nil? v) "" v))

(defn bool-or [v default]
  (if (nil? v) default (boolean v)))

(defmodule CatalogModule
  [setup topologies]
  (declare-depot setup *catalog-depot (hash-by partition-key))

  (let [s (stream-topology topologies "catalog")]
    (declare-pstate
     s $$regions
     {String (fixed-keys-schema
              {"name" String
               "hidden" Boolean
               "currencySymbol" String
               "currencyCode" String})})

    (declare-pstate
     s $$formats
     {String (fixed-keys-schema
              {"name" String
               "code" String})})

    (declare-pstate s $$format-by-code {String String})

    (declare-pstate
     s $$active-signup
     {String ;; regionId
      (map-schema String ;; formatId
                  String ;; seasonId
                  {:subindex? true})})

    (<<sources s
      (source> *catalog-depot :> *event)
      (get *event "type" :> *type)

      ;; ── upsert-region ───────────────────────────────────────────────
      (<<if (= *type "upsert-region")
        (get *event "regionId" :> *region-id)
        (get *event "name" :> *name)
        (get *event "hidden" :> *hidden-raw)
        (get *event "currencySymbol" :> *symbol)
        (get *event "currencyCode" :> *code)
        (region-error *region-id *name :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (bool-or *hidden-raw false :> *hidden)
          (str-or-empty *symbol :> *symbol-s)
          (str-or-empty *code :> *code-s)
          (local-transform>
           [(keypath *region-id)
            (multi-path
             [(keypath "name") (termval *name)]
             [(keypath "hidden") (termval *hidden)]
             [(keypath "currencySymbol") (termval *symbol-s)]
             [(keypath "currencyCode") (termval *code-s)])]
           $$regions)
          (ack-return> {"ok" true "regionId" *region-id})))

      ;; ── set-region-hidden ───────────────────────────────────────────
      (<<if (= *type "set-region-hidden")
        (get *event "regionId" :> *region-id)
        (get *event "hidden" :> *hidden-raw)
        (local-select> (keypath *region-id) $$regions :> *region)
        (<<if (nil? *region)
          (ack-return> {"ok" false "error" "region-not-found"})
         (else>)
          (bool-or *hidden-raw false :> *hidden)
          (local-transform>
           [(keypath *region-id "hidden") (termval *hidden)]
           $$regions)
          (ack-return> {"ok" true "regionId" *region-id "hidden" *hidden})))

      ;; ── upsert-format ───────────────────────────────────────────────
      (<<if (= *type "upsert-format")
        (get *event "formatId" :> *format-id)
        (get *event "name" :> *name)
        (get *event "code" :> *code)
        (format-error *format-id *name *code :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          ;; uniqueness index on code partition
          (|hash *code)
          (local-select> (keypath *code) $$format-by-code :> *taken-by)
          (format-code-taken-error *taken-by *format-id :> *cerr)
          (<<if (some? *cerr)
            (ack-return> {"ok" false "error" *cerr})
           (else>)
            (local-transform>
             [(keypath *code) (termval *format-id)]
             $$format-by-code)
            (|hash *format-id)
            (local-transform>
             [(keypath *format-id)
              (multi-path
               [(keypath "name") (termval *name)]
               [(keypath "code") (termval *code)])]
             $$formats)
            (ack-return> {"ok" true "formatId" *format-id "code" *code}))))

      ;; ── set-active-signup ───────────────────────────────────────────
      (<<if (= *type "set-active-signup")
        (get *event "regionId" :> *region-id)
        (get *event "formatId" :> *format-id)
        (get *event "seasonId" :> *season-id)
        (active-signup-error *region-id *format-id *season-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *region-id *format-id) (termval *season-id)]
           $$active-signup)
          (ack-return> {"ok" true
                       "regionId" *region-id
                       "formatId" *format-id
                       "seasonId" *season-id})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
