(ns mge.tf.rama.catalog-module-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.catalog-module :as cm]))

(def MODULE-NAME "mge.tf.rama.catalog-module/CatalogModule")

(defn append-event!
  [depot event]
  (get (foreign-append! depot event) "catalog"))

(deftest catalog-lifecycle-test
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc cm/CatalogModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*catalog-depot")
          regions (foreign-pstate ipc MODULE-NAME "$$regions")
          region-ids (foreign-pstate ipc MODULE-NAME "$$region-ids")
          formats (foreign-pstate ipc MODULE-NAME "$$formats")
          by-code (foreign-pstate ipc MODULE-NAME "$$format-by-code")
          signup (foreign-pstate ipc MODULE-NAME "$$active-signup")]

      (testing "upsert-region + hide"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "upsert-region"
                      "regionId" "na"
                      "name" "North America"
                      "hidden" false
                      "currencySymbol" "$"
                      "currencyCode" "USD"})
                    "ok")))
        (is (= "North America" (foreign-select-one (keypath "na" "name") regions)))
        (is (= true (foreign-select-one (keypath "all" "na") region-ids))
            "region-ids index should have the upserted region")
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-region-hidden"
                      "regionId" "na"
                      "hidden" true})
                    "ok")))
        (is (= true (foreign-select-one (keypath "na" "hidden") regions)))
        (is (= "region-not-found"
               (get (append-event!
                     depot
                     {"type" "set-region-hidden"
                      "regionId" "missing"
                      "hidden" false})
                    "error"))))

      (testing "upsert-format with code uniqueness"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "upsert-format"
                      "formatId" "2"
                      "name" "2v2"
                      "code" "2v2"})
                    "ok")))
        (is (= "2v2" (foreign-select-one (keypath "2" "code") formats)))
        (is (= "2" (foreign-select-one (keypath "2v2") by-code)))
        (is (= "format-code-taken"
               (get (append-event!
                     depot
                     {"type" "upsert-format"
                      "formatId" "9"
                      "name" "Other"
                      "code" "2v2"})
                    "error")))
        ;; same formatId may re-upsert same code
        (is (= true
               (get (append-event!
                     depot
                     {"type" "upsert-format"
                      "formatId" "2"
                      "name" "2v2 Duo"
                      "code" "2v2"})
                    "ok")))
        (is (= "2v2 Duo" (foreign-select-one (keypath "2" "name") formats))))

      (testing "active signup season pointer"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-active-signup"
                      "regionId" "na"
                      "formatId" "2"
                      "seasonId" "s3"})
                    "ok")))
        (is (= "s3" (foreign-select-one (keypath "na" "2") signup)))
        (is (= "missing-season-id"
               (get (append-event!
                     depot
                     {"type" "set-active-signup"
                      "regionId" "na"
                      "formatId" "2"
                      "seasonId" ""})
                    "error")))))))
