(defproject mge.tf/rama "0.1.0-SNAPSHOT"
  :description "mge.tf Rama modules — Clojure-only backend, TypeScript talks via Rama REST JSON"
  :url "https://mge.tf"
  :license {:name "Proprietary"}
  :source-paths ["src"]
  :test-paths ["test"]
  :dependencies [[com.rpl/rama-helpers "0.10.0"]]
  :repositories [["releases" {:id "maven-releases"
                              :url "https://nexus.redplanetlabs.com/repository/maven-public-releases"}]]
  :profiles {:dev {:resource-paths ["test/resources"]}
             :provided {:dependencies [[com.rpl/rama "1.9.0"]]}}
  :aliases {"test-rama" ["with-profile" "+provided" "test"]})
