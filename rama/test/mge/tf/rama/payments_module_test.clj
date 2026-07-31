(ns mge.tf.rama.payments-module-test
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require
   [clojure.test :refer [deftest is testing]]
   [com.rpl.rama.test :as rtest]
   [mge.tf.rama.payments-module :as pm]))

(def MODULE-NAME "mge.tf.rama.payments-module/PaymentsModule")

(defn append-event!
  [depot event]
  (get (foreign-append! depot event) "payments"))

(deftest payments-lifecycle-test
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc pm/PaymentsModule {:tasks 4 :threads 2})
    (let [depot (foreign-depot ipc MODULE-NAME "*payment-depot")
          player-pay (foreign-pstate ipc MODULE-NAME "$$player-season-payment")
          team-count (foreign-pstate ipc MODULE-NAME "$$team-paid-count")
          orders (foreign-pstate ipc MODULE-NAME "$$item-orders")
          payments (foreign-pstate ipc MODULE-NAME "$$payments")]

      (testing "mark-paid updates player + team count + ledger"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "mark-paid"
                      "steamId" "p1"
                      "seasonId" "s1"
                      "teamId" "t1"
                      "status" "PAID"
                      "amount" 25
                      "source" "PAYPAL"
                      "paymentId" "pay1"})
                    "ok")))
        (is (= "PAID" (foreign-select-one (keypath "p1" "s1" "status") player-pay)))
        (is (= 1 (foreign-select-one (keypath "t1") team-count)))
        (is (= "PAYPAL" (foreign-select-one (keypath "pay1" "source") payments)))
        ;; second mark for same player should not double-count team
        (append-event!
         depot
         {"type" "mark-paid"
          "steamId" "p1"
          "seasonId" "s1"
          "teamId" "t1"
          "status" "PAID"
          "amount" 25
          "source" "PAYPAL"
          "paymentId" "pay2"})
        (is (= 1 (foreign-select-one (keypath "t1") team-count))))

      (testing "item order create/confirm/expire"
        (is (= true
               (get (append-event!
                     depot
                     {"type" "create-item-order"
                      "orderId" "o1"
                      "steamId" "p2"
                      "teamId" "t1"
                      "seasonId" "s1"
                      "amount" 25})
                    "ok")))
        (is (= "PENDING" (foreign-select-one (keypath "o1" "status") orders)))
        (is (= true
               (get (append-event!
                     depot
                     {"type" "confirm-item-order" "orderId" "o1"})
                    "ok")))
        (is (= "COMPLETED" (foreign-select-one (keypath "o1" "status") orders)))
        (is (= "PAID" (foreign-select-one (keypath "p2" "s1" "status") player-pay)))
        (is (= 2 (foreign-select-one (keypath "t1") team-count)))
        (is (= "order-exists"
               (get (append-event!
                     depot
                     {"type" "create-item-order"
                      "orderId" "o1"
                      "steamId" "p3"
                      "teamId" "t1"
                      "seasonId" "s1"
                      "amount" 25})
                    "error")))
        (append-event!
         depot
         {"type" "create-item-order"
          "orderId" "o2"
          "steamId" "p3"
          "teamId" "t1"
          "seasonId" "s1"
          "amount" 25})
        (is (= true
               (get (append-event!
                     depot
                     {"type" "expire-item-order" "orderId" "o2"})
                    "ok")))
        (is (= "EXPIRED" (foreign-select-one (keypath "o2" "status") orders)))))))
