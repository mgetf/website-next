(ns mge.tf.rama.payments-module
  "Payments module — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *payment-depot (hash-by partition-key = orderId|steamId):
    mark-paid | create-item-order | confirm-item-order | expire-item-order

  PStates:
    $$player-season-payment  {steamId -> {seasonId -> {status, amountPaid, source}}}
    $$team-paid-count        {teamId -> Long}  ; active paid members
    $$item-orders            {orderId -> order fields}
    $$payments               {paymentId -> payment record}"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn partition-key [event]
  (or (get event "orderId") (get event "steamId")))

(defn known-type? [t]
  (contains? #{"mark-paid" "create-item-order"
               "confirm-item-order" "expire-item-order"}
             t))

(defn paid-status? [status]
  (contains? #{"PAID" "EXEMPT"} status))

(defn mark-paid-error [steam-id season-id status]
  (cond
    (or (nil? steam-id) (= steam-id "")) "missing-steam-id"
    (or (nil? season-id) (= season-id "")) "missing-season-id"
    (not (paid-status? status)) "invalid-payment-status"
    :else nil))

(defn create-order-error [existing steam-id]
  (cond
    (some? existing) "order-exists"
    (or (nil? steam-id) (= steam-id "")) "missing-steam-id"
    :else nil))

(defn order-action-error [order expected-status]
  (cond
    (nil? order) "order-not-found"
    (not= (get order "status") expected-status) "invalid-order-status"
    :else nil))

(defn long-or-zero [v]
  (long (or v 0)))

(defmodule PaymentsModule
  [setup topologies]
  (declare-depot setup *payment-depot (hash-by partition-key))

  (let [s (stream-topology topologies "payments")]
    (declare-pstate
     s $$player-season-payment
     {String ;; steamId
      (map-schema String ;; seasonId
                  (fixed-keys-schema
                   {"status" String
                    "amountPaid" Long
                    "source" String
                    "teamId" String})
                  {:subindex? true})})

    (declare-pstate
     s $$team-paid-count
     {String Long})

    (declare-pstate
     s $$item-orders
     {String (fixed-keys-schema
              {"steamId" String
               "teamId" String
               "seasonId" String
               "status" String
               "amount" Long})})

    (declare-pstate
     s $$payments
     {String (fixed-keys-schema
              {"steamId" String
               "seasonId" String
               "teamId" String
               "amount" Long
               "source" String
               "status" String})})

    (<<sources s
      (source> *payment-depot :> *event)
      (get *event "type" :> *type)

      ;; ── mark-paid ───────────────────────────────────────────────────
      (<<if (= *type "mark-paid")
        (get *event "steamId" :> *steam-id)
        (get *event "seasonId" :> *season-id)
        (get *event "teamId" :> *team-id)
        (get *event "status" :> *status)
        (get *event "amount" :> *amount-raw)
        (get *event "source" :> *source)
        (get *event "paymentId" :> *payment-id)
        (long-or-zero *amount-raw :> *amount)
        (mark-paid-error *steam-id *season-id *status :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-select>
           (keypath *steam-id *season-id "status")
           $$player-season-payment :> *prev-status)
          (local-transform>
           [(keypath *steam-id *season-id)
            (multi-path
             [(keypath "status") (termval *status)]
             [(keypath "amountPaid") (termval *amount)]
             [(keypath "source") (termval *source)]
             [(keypath "teamId") (termval *team-id)])]
           $$player-season-payment)
          (<<if (some? *payment-id)
            (|hash *payment-id)
            (local-transform>
             [(keypath *payment-id)
              (multi-path
               [(keypath "steamId") (termval *steam-id)]
               [(keypath "seasonId") (termval *season-id)]
               [(keypath "teamId") (termval *team-id)]
               [(keypath "amount") (termval *amount)]
               [(keypath "source") (termval *source)]
               [(keypath "status") (termval *status)])]
             $$payments))
          ;; bump team paid count only on transition into paid
          (<<if (and> (paid-status? *status)
                      (not (paid-status? *prev-status))
                      (some? *team-id)
                      (not= *team-id ""))
            (|hash *team-id)
            (local-transform>
             [(keypath *team-id) (nil->val 0) (term inc)]
             $$team-paid-count))
          (ack-return> {"ok" true
                       "steamId" *steam-id
                       "seasonId" *season-id
                       "status" *status})))

      ;; ── create-item-order ───────────────────────────────────────────
      (<<if (= *type "create-item-order")
        (get *event "orderId" :> *order-id)
        (get *event "steamId" :> *steam-id)
        (get *event "teamId" :> *team-id)
        (get *event "seasonId" :> *season-id)
        (get *event "amount" :> *amount-raw)
        (long-or-zero *amount-raw :> *amount)
        (local-select> (keypath *order-id) $$item-orders :> *existing)
        (create-order-error *existing *steam-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *order-id)
            (multi-path
             [(keypath "steamId") (termval *steam-id)]
             [(keypath "teamId") (termval *team-id)]
             [(keypath "seasonId") (termval *season-id)]
             [(keypath "status") (termval "PENDING")]
             [(keypath "amount") (termval *amount)])]
           $$item-orders)
          (ack-return> {"ok" true "orderId" *order-id "status" "PENDING"})))

      ;; ── confirm-item-order ──────────────────────────────────────────
      (<<if (= *type "confirm-item-order")
        (get *event "orderId" :> *order-id)
        (local-select> (keypath *order-id) $$item-orders :> *order)
        (order-action-error *order "PENDING" :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (get *order "steamId" :> *steam-id)
          (get *order "seasonId" :> *season-id)
          (get *order "teamId" :> *team-id)
          (get *order "amount" :> *amount)
          (local-transform>
           [(keypath *order-id "status") (termval "COMPLETED")]
           $$item-orders)
          (|hash *steam-id)
          (local-select>
           (keypath *steam-id *season-id "status")
           $$player-season-payment :> *prev-status)
          (local-transform>
           [(keypath *steam-id *season-id)
            (multi-path
             [(keypath "status") (termval "PAID")]
             [(keypath "amountPaid") (termval *amount)]
             [(keypath "source") (termval "ITEM")]
             [(keypath "teamId") (termval *team-id)])]
           $$player-season-payment)
          (<<if (and> (not (paid-status? *prev-status))
                      (some? *team-id)
                      (not= *team-id ""))
            (|hash *team-id)
            (local-transform>
             [(keypath *team-id) (nil->val 0) (term inc)]
             $$team-paid-count))
          (ack-return> {"ok" true
                       "orderId" *order-id
                       "steamId" *steam-id
                       "status" "COMPLETED"})))

      ;; ── expire-item-order ───────────────────────────────────────────
      (<<if (= *type "expire-item-order")
        (get *event "orderId" :> *order-id)
        (local-select> (keypath *order-id) $$item-orders :> *order)
        (order-action-error *order "PENDING" :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-transform>
           [(keypath *order-id "status") (termval "EXPIRED")]
           $$item-orders)
          (ack-return> {"ok" true "orderId" *order-id "status" "EXPIRED"})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
