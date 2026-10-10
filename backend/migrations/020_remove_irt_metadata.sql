-- Run through the migration runner, which wraps this entire file in a transaction.
-- Do not use CASCADE: unknown dependent objects must abort and roll back this migration.
CREATE TEMP TABLE irt_view_metadata ON COMMIT DROP AS
SELECT c.oid, n.nspname, c.relname, pg_get_userbyid(c.relowner) AS owner_name,
       c.reloptions, obj_description(c.oid, 'pg_class') AS comment,
       COALESCE(c.relacl, acldefault('r', c.relowner)) AS acl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='topik_bank' AND c.relname IN ('current_items','current_set_contents') AND c.relkind='v';
CREATE TEMP TABLE irt_view_column_metadata ON COMMIT DROP AS
SELECT v.nspname,v.relname,a.attname,a.attacl,
       col_description(a.attrelid,a.attnum) AS comment
  FROM irt_view_metadata v JOIN pg_attribute a ON a.attrelid=v.oid
 WHERE a.attnum>0 AND NOT a.attisdropped
   AND a.attname NOT IN ('predicted_difficulty','default_predicted_difficulty','irt_difficulty','irt_discrimination');

DROP VIEW topik_bank.current_set_contents;
DROP VIEW topik_bank.current_items;

ALTER TABLE topik_app.session_items
  DROP COLUMN theta_before, DROP COLUMN theta_after, DROP COLUMN policy_version;
ALTER TABLE topik_app.response_observations
  DROP COLUMN theta_before, DROP COLUMN theta_after, DROP COLUMN policy_version,
  DROP COLUMN estimation_run_id, DROP COLUMN estimator_version;
DROP TABLE topik_app.theta_estimation_runs;
ALTER TABLE topik_bank.item_versions
  DROP COLUMN irt_difficulty, DROP COLUMN irt_discrimination, DROP COLUMN predicted_difficulty;
ALTER TABLE topik_bank.question_sets DROP COLUMN default_predicted_difficulty;

CREATE OR REPLACE VIEW "topik_bank"."current_items" AS
 SELECT DISTINCT ON ("i"."item_id") "i"."source_key",
    "i"."created_at" AS "item_created_at",
    "v"."item_id",
    "v"."item_version",
    "v"."section",
    "v"."item_type",
    "v"."primary_skill",
    "v"."target_level",
    "v"."stem_length",
    "v"."choice_count",
    "v"."generator_provider",
    "v"."generator_model",
    "v"."generator_version",
    "v"."prompt_version",
    "v"."review_status",
    "v"."stem",
    "v"."choices",
    "v"."correct_answer",
    "v"."explanation",
    "v"."content_json",
    "v"."source_provenance",
    "v"."content_hash",
    "v"."created_at",
    "v"."type_slot"
   FROM ("topik_bank"."items" "i"
     JOIN "topik_bank"."item_versions" "v" ON (("v"."item_id" = "i"."item_id")))
  ORDER BY "i"."item_id", "v"."item_version" DESC;

CREATE OR REPLACE VIEW "topik_bank"."current_set_contents" AS
 SELECT "question_set"."set_id",
    "question_set"."section" AS "set_section",
    "question_set"."generator_provider" AS "set_generator_provider",
    "question_set"."generator_model" AS "set_generator_model",
    "question_set"."generator_version" AS "set_generator_version",
    "question_set"."review_status" AS "set_review_status",
    "question_set"."default_target_level",
    "question_set"."published_at",
    "member"."position",
    "item"."source_key",
    "version"."item_id",
    "version"."item_version",
    "version"."type_slot",
    "version"."item_type",
    "version"."primary_skill",
    "version"."target_level",
    "version"."review_status" AS "item_review_status",
    "version"."stem",
    "version"."choices",
    "version"."correct_answer",
    "version"."explanation",
    "version"."content_json",
    "version"."source_provenance",
    "question_set"."set_sequence"
   FROM ((("topik_bank"."question_sets" "question_set"
     JOIN "topik_bank"."question_set_items" "member" ON (("member"."set_id" = "question_set"."set_id")))
     JOIN "topik_bank"."items" "item" ON (("item"."item_id" = "member"."item_id")))
     JOIN "topik_bank"."item_versions" "version" ON ((("version"."item_id" = "member"."item_id") AND ("version"."item_version" = "member"."item_version"))));

-- Recreating views must not broaden access via the migration role's default privileges.
DO $$
DECLARE v RECORD; privilege RECORD; col RECORD; recipient TEXT;
BEGIN
  FOR v IN SELECT * FROM irt_view_metadata LOOP
    FOR privilege IN
      SELECT DISTINCT a.grantee FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      WHERE n.nspname=v.nspname AND c.relname=v.relname
    LOOP
      recipient := CASE WHEN privilege.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(privilege.grantee)) END;
      EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %s',v.nspname,v.relname,recipient);
    END LOOP;
    EXECUTE format('ALTER VIEW %I.%I OWNER TO %I',v.nspname,v.relname,v.owner_name);
    IF v.reloptions IS NOT NULL THEN
      EXECUTE format('ALTER VIEW %I.%I SET (%s)',v.nspname,v.relname,array_to_string(v.reloptions,','));
    END IF;
    EXECUTE format('COMMENT ON VIEW %I.%I IS %L',v.nspname,v.relname,v.comment);
    FOR privilege IN SELECT * FROM aclexplode(v.acl) LOOP
      recipient := CASE WHEN privilege.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(privilege.grantee)) END;
      EXECUTE format('GRANT %s ON TABLE %I.%I TO %s%s',privilege.privilege_type,v.nspname,v.relname,recipient,
        CASE WHEN privilege.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;
  END LOOP;
  FOR col IN SELECT * FROM irt_view_column_metadata LOOP
    EXECUTE format('COMMENT ON COLUMN %I.%I.%I IS %L',col.nspname,col.relname,col.attname,col.comment);
    FOR privilege IN SELECT * FROM aclexplode(col.attacl) LOOP
      recipient := CASE WHEN privilege.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(privilege.grantee)) END;
      EXECUTE format('GRANT %s (%I) ON TABLE %I.%I TO %s%s',privilege.privilege_type,col.attname,col.nspname,col.relname,recipient,
        CASE WHEN privilege.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;
  END LOOP;
END $$;
