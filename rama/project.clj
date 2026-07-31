(defproject mge.tf/rama "0.1.0-SNAPSHOT"
  :description "mge.tf Rama modules — Clojure-only backend, TypeScript talks via Rama REST JSON"
  :url "https://mge.tf"
  :license {:name "Proprietary"}
  :source-paths ["src"]
  :test-paths ["test"]
  :dependencies [[com.rpl/rama-helpers "0.10.0"]]
  :repositories [["releases" {:id "maven-releases"
                              :url "https://nexus.redplanetlabs.com/repository/maven-public-releases"}]]
  ;; Rama dataflow macroexpansion is stack-hungry as modules grow.
  :jvm-opts ["-Xss8m"]
  :profiles {:dev {:resource-paths ["test/resources"]}
             :provided {:dependencies [[com.rpl/rama "1.9.0"]]}
             :uberjar {:aot [mge.tf.rama.match-module
                             mge.tf.rama.users-module
                             mge.tf.rama.teams-module
                             mge.tf.rama.payments-module
                             mge.tf.rama.notifications-module
                             mge.tf.rama.seasons-module
                             mge.tf.rama.map-pools-module
                             mge.tf.rama.events-module
                             mge.tf.rama.catalog-module
                             mge.tf.rama.divisions-module
                             mge.tf.rama.demos-module
                             mge.tf.rama.globals-module]
                       :uberjar-name "mge-rama.jar"}}
  :aliases {"test-rama" ["with-profile" "+provided" "test"]
            "uberjar-modules" ["with-profile" "+provided,+uberjar" "uberjar"]})
