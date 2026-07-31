(ns mge.tf.rama.map-pools-module-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.map-pools-module :as mpm]))

(def MODULE-NAME "mge.tf.rama.map-pools-module/MapPoolsModule")

(defn append-event!
  [depot event]
  (get (foreign-append! depot event) "map-pools"))

(deftest map-pools-lifecycle-test
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc mpm/MapPoolsModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*map-pool-depot")
          arenas (foreign-pstate ipc MODULE-NAME "$$arenas")
          pools (foreign-pstate ipc MODULE-NAME "$$pools")
          pool-maps (foreign-pstate ipc MODULE-NAME "$$pool-maps")]

      (testing "upsert-arena"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "upsert-arena"
                      "arenaId" "process"
                      "name" "Process"
                      "avatar" "/a.png"
                      "playoffMap" 0})
                    "ok")))
        (is (= "Process" (foreign-select-one (keypath "process" "name") arenas)))
        (append-event!
         depot
         {"type" "upsert-arena"
          "arenaId" "discard"
          "name" "Discard"
          "avatar" ""
          "playoffMap" 1})
        (is (= 1 (foreign-select-one (keypath "discard" "playoffMap") arenas)))
        (is (= "missing-arena-name"
               (get (append-event!
                     depot
                     {"type" "upsert-arena"
                      "arenaId" "x"
                      "name" ""})
                    "error"))))

      (testing "create-pool + rename + active + maps"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "create-pool"
                      "poolId" "p1"
                      "name" "S3 Pool"})
                    "ok")))
        (is (= false (foreign-select-one (keypath "p1" "isActive") pools)))
        (is (= [] (foreign-select-one (keypath "p1") pool-maps)))
        (is (= "pool-exists"
               (get (append-event!
                     depot
                     {"type" "create-pool"
                      "poolId" "p1"
                      "name" "Dup"})
                    "error")))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "rename-pool"
                      "poolId" "p1"
                      "name" "Season 3"})
                    "ok")))
        (is (= "Season 3" (foreign-select-one (keypath "p1" "name") pools)))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-pool-active"
                      "poolId" "p1"
                      "isActive" true})
                    "ok")))
        (is (= true (foreign-select-one (keypath "p1" "isActive") pools)))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "set-pool-maps"
                      "poolId" "p1"
                      "arenaIds" ["process" "discard" "viggle"]})
                    "ok")))
        (is (= ["process" "discard" "viggle"]
               (foreign-select-one (keypath "p1") pool-maps)))
        ;; wholesale replace
        (append-event!
         depot
         {"type" "set-pool-maps"
          "poolId" "p1"
          "arenaIds" ["process" "asa"]})
        (is (= ["process" "asa"] (foreign-select-one (keypath "p1") pool-maps)))
        (is (= "pool-not-found"
               (get (append-event!
                     depot
                     {"type" "set-pool-maps"
                      "poolId" "missing"
                      "arenaIds" ["process"]})
                    "error")))))))
