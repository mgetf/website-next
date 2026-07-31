(ns mge.tf.rama.demos-module
  "Demos module — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *demo-depot (hash-by reportId|demoId):
    create-demo | report-demo | resolve-report

  Hash prefers reportId so report + resolve share a partition.
  create-demo (no reportId) hashes by demoId.

  PStates:
    $$demos              {demoId -> demo fields}
    $$demos-by-match     {matchId -> {demoId -> true}}
    $$demo-reports       {reportId -> report fields}
    $$reports-by-status  {status -> {reportId -> true}}
    $$reports-by-demo    {demoId -> {reportId -> true}}"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn demo-id [event]
  ;; Prefer reportId so resolve-report (reportId only) lands with report-demo.
  (or (get event "reportId") (get event "demoId")))

(defn known-type? [t]
  (contains? #{"create-demo" "report-demo" "resolve-report"} t))

(defn str-or-empty [v]
  (if (nil? v) "" v))

(defn create-demo-error [existing demo-id match-id]
  (cond
    (or (nil? demo-id) (= demo-id "")) "missing-demo-id"
    (or (nil? match-id) (= match-id "")) "missing-match-id"
    (some? existing) "demo-exists"
    :else nil))

(defn report-error [existing report-id demo-id]
  (cond
    (or (nil? report-id) (= report-id "")) "missing-report-id"
    (or (nil? demo-id) (= demo-id "")) "missing-demo-id"
    (some? existing) "report-exists"
    :else nil))

(defn resolve-error [report]
  (when (nil? report) "report-not-found"))

(defmodule DemosModule
  [setup topologies]
  (declare-depot setup *demo-depot (hash-by demo-id))

  (let [s (stream-topology topologies "demos")]
    (declare-pstate
     s $$demos
     {String (fixed-keys-schema
              {"matchId" String
               "playerSteamId" String
               "submittedBy" String
               "file" String
               "title" String
               "description" String
               "createdAt" String})})

    (declare-pstate
     s $$demos-by-match
     {String (map-schema String Boolean)})

    (declare-pstate
     s $$demo-reports
     {String (fixed-keys-schema
              {"demoId" String
               "reportedBy" String
               "status" String
               "description" String
               "adminComments" String
               "adminId" String
               "reportedAt" String})})

    (declare-pstate
     s $$reports-by-status
     {String (map-schema String Boolean)})

    (declare-pstate
     s $$reports-by-demo
     {String (map-schema String Boolean)})

    (<<sources s
      (source> *demo-depot :> *event)
      (get *event "type" :> *type)

      (<<if (= *type "create-demo")
        (get *event "demoId" :> *demo-id)
        (get *event "matchId" :> *match-id)
        (get *event "playerSteamId" :> *player)
        (get *event "submittedBy" :> *submitter)
        (get *event "file" :> *file-raw)
        (get *event "title" :> *title-raw)
        (get *event "description" :> *desc-raw)
        (get *event "createdAt" :> *created-raw)
        (str-or-empty *file-raw :> *file)
        (str-or-empty *title-raw :> *title)
        (str-or-empty *desc-raw :> *desc)
        (str-or-empty *created-raw :> *created-at)
        (local-select> (keypath *demo-id) $$demos :> *existing)
        (create-demo-error *existing *demo-id *match-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *demo-id)
            (multi-path
             [(keypath "matchId") (termval *match-id)]
             [(keypath "playerSteamId") (termval *player)]
             [(keypath "submittedBy") (termval *submitter)]
             [(keypath "file") (termval *file)]
             [(keypath "title") (termval *title)]
             [(keypath "description") (termval *desc)]
             [(keypath "createdAt") (termval *created-at)])]
           $$demos)
          (|hash *match-id)
          (local-transform>
           [(keypath *match-id *demo-id) (termval true)]
           $$demos-by-match)
          (ack-return> {"ok" true "demoId" *demo-id})))

      (<<if (= *type "report-demo")
        (get *event "reportId" :> *report-id)
        (get *event "demoId" :> *demo-id)
        (get *event "reportedBy" :> *reporter)
        (get *event "description" :> *desc-raw)
        (get *event "reportedAt" :> *reported-raw)
        (str-or-empty *desc-raw :> *desc)
        (str-or-empty *reported-raw :> *reported-at)
        (local-select> (keypath *report-id) $$demo-reports :> *existing)
        (report-error *existing *report-id *demo-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *report-id)
            (multi-path
             [(keypath "demoId") (termval *demo-id)]
             [(keypath "reportedBy") (termval *reporter)]
             [(keypath "status") (termval "REVIEW")]
             [(keypath "description") (termval *desc)]
             [(keypath "adminComments") (termval "")]
             [(keypath "adminId") (termval "")]
             [(keypath "reportedAt") (termval *reported-at)])]
           $$demo-reports)
          (|hash "REVIEW")
          (local-transform>
           [(keypath "REVIEW" *report-id) (termval true)]
           $$reports-by-status)
          (|hash *demo-id)
          (local-transform>
           [(keypath *demo-id *report-id) (termval true)]
           $$reports-by-demo)
          (ack-return> {"ok" true "reportId" *report-id "status" "REVIEW"})))

      (<<if (= *type "resolve-report")
        (get *event "reportId" :> *report-id)
        (get *event "status" :> *status)
        (get *event "adminComments" :> *comments-raw)
        (get *event "adminId" :> *admin-raw)
        (str-or-empty *comments-raw :> *comments)
        (str-or-empty *admin-raw :> *admin-id)
        (local-select> (keypath *report-id) $$demo-reports :> *report)
        (resolve-error *report :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (get *report "status" :> *old-status)
          (local-transform>
           [(keypath *report-id)
            (multi-path
             [(keypath "status") (termval *status)]
             [(keypath "adminComments") (termval *comments)]
             [(keypath "adminId") (termval *admin-id)])]
           $$demo-reports)
          (|hash *old-status)
          (local-transform>
           [(keypath *old-status *report-id) NONE>]
           $$reports-by-status)
          (|hash *status)
          (local-transform>
           [(keypath *status *report-id) (termval true)]
           $$reports-by-status)
          (ack-return> {"ok" true "reportId" *report-id "status" *status})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
