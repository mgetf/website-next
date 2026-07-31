(ns mge.tf.rama.users-module
  "Users module — JSON-map events for Rama REST (no Clojure HTTP)."
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn steam-id [event]
  (get event "steamId"))

(defn known-type? [t]
  (contains? #{"upsert-profile" "set-permission" "set-ban"
               "bump-session" "link-discord" "unlink-discord"}
             t))

(defn ban-error [status]
  (when-not (contains? #{"NONE" "SUSPENDED" "BANNED"} status)
    "invalid-ban-status"))

(defn permission-error [level]
  (when-not (contains? #{"GUEST" "MODERATOR" "ADMIN"} level)
    "invalid-permission-level"))

(defn mutate-error [existing field-err]
  (cond
    (some? field-err) field-err
    (nil? existing) "user-not-found"
    :else nil))

(defn discord-id-error [discord-id taken-by steam-id]
  (cond
    (or (nil? discord-id) (= discord-id "")) "missing-discord-id"
    (and (some? taken-by) (not= taken-by steam-id)) "discord-taken"
    :else nil))

(defn clear-old-discord? [old discord-id]
  (boolean (and (some? old) (not= old "") (not= old discord-id))))

(defmodule UsersModule
  [setup topologies]
  (declare-depot setup *user-depot (hash-by steam-id))

  (let [s (stream-topology topologies "users")]
    (declare-pstate
     s $$users
     {String (fixed-keys-schema
              {"username" String
               "avatarUrl" String
               "permissionLevel" String
               "banStatus" String
               "sessionVersion" Long
               "discordId" String})})
    (declare-pstate s $$discord-by-id {String String})

    (<<sources s
      (source> *user-depot :> *event)
      (get *event "type" :> *type)
      (get *event "steamId" :> *steam-id)

      (<<if (= *type "upsert-profile")
        (get *event "username" :> *username)
        (get *event "avatarUrl" :> *avatar)
        (local-select> (keypath *steam-id "sessionVersion") $$users :> *sv)
        (local-transform> [(keypath *steam-id "username") (termval *username)] $$users)
        (local-transform> [(keypath *steam-id "avatarUrl") (termval *avatar)] $$users)
        (<<if (nil? *sv)
          (local-transform> [(keypath *steam-id "sessionVersion") (termval 0)] $$users)
          (local-transform> [(keypath *steam-id "permissionLevel") (termval "GUEST")] $$users)
          (local-transform> [(keypath *steam-id "banStatus") (termval "NONE")] $$users))
        (ack-return> {"ok" true "steamId" *steam-id}))

      (<<if (= *type "set-permission")
        (get *event "permissionLevel" :> *level)
        (permission-error *level :> *field-err)
        (local-select> (keypath *steam-id) $$users :> *existing)
        (mutate-error *existing *field-err :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-select>
           [(keypath *steam-id "sessionVersion") (nil->val 0)]
           $$users :> *sv)
          (inc *sv :> *next-sv)
          (local-transform>
           [(keypath *steam-id "permissionLevel") (termval *level)]
           $$users)
          (local-transform>
           [(keypath *steam-id "sessionVersion") (termval *next-sv)]
           $$users)
          (ack-return> {"ok" true
                       "steamId" *steam-id
                       "permissionLevel" *level
                       "sessionVersion" *next-sv})))

      (<<if (= *type "set-ban")
        (get *event "banStatus" :> *status)
        (ban-error *status :> *field-err)
        (local-select> (keypath *steam-id) $$users :> *existing)
        (mutate-error *existing *field-err :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (local-select>
           [(keypath *steam-id "sessionVersion") (nil->val 0)]
           $$users :> *sv)
          (inc *sv :> *next-sv)
          (local-transform>
           [(keypath *steam-id "banStatus") (termval *status)]
           $$users)
          (local-transform>
           [(keypath *steam-id "sessionVersion") (termval *next-sv)]
           $$users)
          (ack-return> {"ok" true
                       "steamId" *steam-id
                       "banStatus" *status
                       "sessionVersion" *next-sv})))

      (<<if (= *type "bump-session")
        (local-select> (keypath *steam-id) $$users :> *existing)
        (<<if (nil? *existing)
          (ack-return> {"ok" false "error" "user-not-found"})
         (else>)
          (local-select>
           [(keypath *steam-id "sessionVersion") (nil->val 0)]
           $$users :> *sv)
          (inc *sv :> *next-sv)
          (local-transform>
           [(keypath *steam-id "sessionVersion") (termval *next-sv)]
           $$users)
          (ack-return> {"ok" true
                       "steamId" *steam-id
                       "sessionVersion" *next-sv})))

      (<<if (= *type "link-discord")
        (get *event "discordId" :> *discord-id)
        (local-select> (keypath *steam-id) $$users :> *existing)
        (<<if (nil? *existing)
          (ack-return> {"ok" false "error" "user-not-found"})
         (else>)
          ;; reverse index lives on the discordId partition — hop before read
          (local-select> (keypath *steam-id "discordId") $$users :> *old)
          (|hash *discord-id)
          (local-select> (keypath *discord-id) $$discord-by-id :> *taken-by)
          (discord-id-error *discord-id *taken-by *steam-id :> *err)
          (<<if (some? *err)
            (ack-return> {"ok" false "error" *err "takenBy" *taken-by})
           (else>)
            (local-transform>
             [(keypath *discord-id) (termval *steam-id)]
             $$discord-by-id)
            (<<if (clear-old-discord? *old *discord-id)
              (|hash *old)
              (local-transform> [(keypath *old) NONE>] $$discord-by-id))
            (|hash *steam-id)
            (local-transform>
             [(keypath *steam-id "discordId") (termval *discord-id)]
             $$users)
            (ack-return> {"ok" true
                         "steamId" *steam-id
                         "discordId" *discord-id}))))

      (<<if (= *type "unlink-discord")
        (local-select> (keypath *steam-id) $$users :> *existing)
        (<<if (nil? *existing)
          (ack-return> {"ok" false "error" "user-not-found"})
         (else>)
          (local-select> (keypath *steam-id "discordId") $$users :> *old)
          (<<if (clear-old-discord? *old "")
            (|hash *old)
            (local-transform> [(keypath *old) NONE>] $$discord-by-id))
          (|hash *steam-id)
          (local-transform> [(keypath *steam-id "discordId") (termval nil)] $$users)
          (ack-return> {"ok" true "steamId" *steam-id})))

      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
