DO $$
DECLARE item text; populated boolean;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'account','session','user','verification','advertisements','advertising_rates',
    'amenities','audit_log','business_amenities','business_drafts','business_hours',
    'business_locations','business_memberships','business_publications','business_revisions',
    'business_services','businesses','categories','change_requests','cities',
    'contact_channels','events','legal_documents','media_assets','notification_outbox',
    'plan_benefits','plans','platform_settings','promotions','review_decisions','states',
    'subscriptions','user_roles'
  ] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I LIMIT 1)', item) INTO populated;
    IF populated THEN
      RAISE EXCEPTION 'Table % contains data; rollback refused. Restore a backup or write a data-preserving migration.', item;
    END IF;
  END LOOP;
END $$;
DROP TABLE account, session, verification, advertisements, advertising_rates,
  business_amenities, business_drafts, business_hours, business_locations,
  business_memberships, business_publications, business_revisions, business_services,
  change_requests, contact_channels, events, legal_documents, media_assets,
  notification_outbox, plan_benefits, platform_settings, promotions, review_decisions,
  subscriptions, user_roles, audit_log, businesses, categories, cities, amenities,
  plans, states, "user" CASCADE;
DROP TYPE configuration_status, editorial_status, membership_status, request_status,
  rights_status, radar_role, subscription_status, verification_status;
