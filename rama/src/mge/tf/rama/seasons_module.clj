(ns mge.tf.rama.seasons-module
  "Seasons module — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *season-depot (hash-by seasonId):
    create-season | set-flags | set-schedule | set-info | update-season

  PStates:
    $$seasons       {seasonId -> season fields}
    $$season-index  {regionId -> {formatId -> {seasonNumStr -> seasonId}}}
                    uniqueness for (region, format, seasonNum)"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn season-id [event]
  (get event "seasonId"))

(defn known-type? [t]
  (contains? #{"create-season" "set-flags" "set-schedule"
               "set-info" "update-season"}
             t))

(defn create-error [existing season-id region-id format-id season-num-raw]
  (cond
    (or (nil? season-id) (= season-id "")) "missing-season-id"
    (or (nil? region-id) (= region-id "")) "missing-region-id"
    (or (nil? format-id) (= format-id "")) "missing-format-id"
    (nil? season-num-raw) "missing-season-num"
    (some? existing) "season-exists"
    :else nil))

(defn uniqueness-error [taken-by season-id]
  (when (and (some? taken-by) (not= taken-by season-id))
    "season-num-taken"))

(defn missing-season-error [season]
  (when (nil? season) "season-not-found"))

(defn bool-or [v default]
  (if (nil? v) default (boolean v)))

(defn long-or-zero [v]
  (long (if (nil? v) 0 v)))

(defn str-or-empty [v]
  (if (nil? v) "" v))

(defmodule SeasonsModule
  [setup topologies]
  (declare-depot setup *season-depot (hash-by season-id))

  (let [s (stream-topology topologies "seasons")]
    (declare-pstate
     s $$seasons
     {String (fixed-keys-schema
              {"seasonNum" Long
               "numWeeks" Long
               "regionId" String
               "formatId" String
               "signupsOpen" Boolean
               "rosterLocked" Boolean
               "paymentRequired" Boolean
               "matchWeek" Long
               "matchDeadline" String
               "info" String})})

    (declare-pstate
     s $$season-index
     {String ;; regionId
      (map-schema String ;; formatId
                  (map-schema String ;; seasonNum as string
                              String ;; seasonId
                              {:subindex? true})
                  {:subindex? true})})

    (<<sources s
      (source> *season-depot :> *event)
      (get *event "type" :> *type)
      (get *event "seasonId" :> *season-id)

      ;; ── create-season ───────────────────────────────────────────────
      (<<if (= *type "create-season")
        (get *event "seasonNum" :> *season-num-raw)
        (get *event "numWeeks" :> *num-weeks-raw)
        (get *event "regionId" :> *region-id)
        (get *event "formatId" :> *format-id)
        (local-select> (keypath *season-id) $$seasons :> *existing)
        (create-error *existing *season-id *region-id *format-id *season-num-raw :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (long-or-zero *season-num-raw :> *season-num)
          (long-or-zero *num-weeks-raw :> *num-weeks)
          (str *season-num :> *season-num-str)
          ;; uniqueness index lives on the regionId partition — hop before read
          (|hash *region-id)
          (local-select>
           (keypath *region-id *format-id *season-num-str)
           $$season-index :> *taken-by)
          (uniqueness-error *taken-by *season-id :> *uerr)
          (<<if (some? *uerr)
            (ack-return> {"ok" false "error" *uerr})
           (else>)
            (local-transform>
             [(keypath *region-id *format-id *season-num-str) (termval *season-id)]
             $$season-index)
            (|hash *season-id)
            (local-transform>
             [(keypath *season-id)
              (multi-path
               [(keypath "seasonNum") (termval *season-num)]
               [(keypath "numWeeks") (termval *num-weeks)]
               [(keypath "regionId") (termval *region-id)]
               [(keypath "formatId") (termval *format-id)]
               [(keypath "signupsOpen") (termval false)]
               [(keypath "rosterLocked") (termval false)]
               [(keypath "paymentRequired") (termval false)]
               [(keypath "matchWeek") (termval 0)]
               [(keypath "matchDeadline") (termval "")]
               [(keypath "info") (termval "")])]
             $$seasons)
            (ack-return> {"ok" true "seasonId" *season-id}))))

      ;; ── set-flags ───────────────────────────────────────────────────
      (<<if (= *type "set-flags")
        (get *event "signupsOpen" :> *signups)
        (get *event "rosterLocked" :> *locked)
        (get *event "paymentRequired" :> *pay-req)
        (local-select> (keypath *season-id) $$seasons :> *season)
        (missing-season-error *season :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (bool-or *signups false :> *signups-b)
          (bool-or *locked false :> *locked-b)
          (bool-or *pay-req false :> *pay-req-b)
          (local-transform>
           [(keypath *season-id)
            (multi-path
             [(keypath "signupsOpen") (termval *signups-b)]
             [(keypath "rosterLocked") (termval *locked-b)]
             [(keypath "paymentRequired") (termval *pay-req-b)])]
           $$seasons)
          (ack-return> {"ok" true "seasonId" *season-id})))

      ;; ── set-schedule ────────────────────────────────────────────────
      (<<if (= *type "set-schedule")
        (get *event "matchWeek" :> *week-raw)
        (get *event "matchDeadline" :> *deadline)
        (local-select> (keypath *season-id) $$seasons :> *season)
        (missing-season-error *season :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (long-or-zero *week-raw :> *week)
          (str-or-empty *deadline :> *deadline-s)
          (local-transform>
           [(keypath *season-id)
            (multi-path
             [(keypath "matchWeek") (termval *week)]
             [(keypath "matchDeadline") (termval *deadline-s)])]
           $$seasons)
          (ack-return> {"ok" true "seasonId" *season-id})))

      ;; ── set-info ────────────────────────────────────────────────────
      (<<if (= *type "set-info")
        (get *event "info" :> *info)
        (local-select> (keypath *season-id) $$seasons :> *season)
        (missing-season-error *season :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (str-or-empty *info :> *info-s)
          (local-transform>
           [(keypath *season-id "info") (termval *info-s)]
           $$seasons)
          (ack-return> {"ok" true "seasonId" *season-id})))

      ;; ── update-season (numWeeks only — identity keys are immutable) ─
      (<<if (= *type "update-season")
        (get *event "numWeeks" :> *num-weeks-raw)
        (local-select> (keypath *season-id) $$seasons :> *season)
        (missing-season-error *season :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (long-or-zero *num-weeks-raw :> *num-weeks)
          (local-transform>
           [(keypath *season-id "numWeeks") (termval *num-weeks)]
           $$seasons)
          (ack-return> {"ok" true "seasonId" *season-id})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
