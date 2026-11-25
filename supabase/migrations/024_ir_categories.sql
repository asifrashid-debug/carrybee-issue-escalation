-- IR Issue Escalation: IR category list (separate from the requester list in category_master).
-- Used when the IR box is ticked alone. Source: IR-Category & Sub-Category.csv (2026-11-25).
-- issue_type gives the priority (Critical P1, Urgent P2, Regular P3). sla_days = IR resolve SLA in days.
-- Also adds escalations.ir_resolve_sla_days, copied from the category when the issue is raised.
-- Not applied yet: apply with the Supabase connector or the SQL editor on project kssypfibhlmoxucabhdu.

create table if not exists public.ir_category_master (
  id bigserial primary key,
  category text not null,
  sub_category text not null,
  issue_type text not null check (issue_type in ('Critical', 'Urgent', 'Regular')),
  sla_days integer not null check (sla_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category, sub_category)
);

alter table public.ir_category_master enable row level security;

insert into public.ir_category_master (category, sub_category, issue_type, sla_days) values
  ('Hijack / Robbery', 'Cash Hijacked During Delivery', 'Critical', 5),
  ('Hijack / Robbery', 'Parcel Hijacked During Delivery', 'Critical', 5),
  ('Hijack / Robbery', 'Parcel Hijacked During Return / Pickup', 'Critical', 5),
  ('Hijack / Robbery', 'Parcel Taken by Force', 'Critical', 5),
  ('Cash / COD Discrepancy', 'Cash Lost at Hub', 'Critical', 5),
  ('Cash / COD Discrepancy', 'Cash Lost During Delivery', 'Critical', 5),
  ('Cash / COD Discrepancy', 'Rider Ran Away with Cash', 'Critical', 5),
  ('Cash / COD Discrepancy', 'Wrong COD Amount Entered', 'Critical', 5),
  ('Cash / COD Discrepancy', 'Fake or Torn Note Received', 'Urgent', 3),
  ('Parcel Lost', 'Parcel Lost at Pickup', 'Urgent', 3),
  ('Parcel Lost', 'Parcel Lost at Hub', 'Urgent', 3),
  ('Parcel Lost', 'Parcel Lost on the Way (In Transit)', 'Urgent', 3),
  ('Parcel Lost', 'Parcel Lost at Central Sort', 'Urgent', 3),
  ('Parcel Lost', 'Parcel Lost at Last Mile', 'Critical', 4),
  ('Parcel Lost', 'Parcel Lost While Delivering', 'Critical', 4),
  ('Parcel Lost', 'Parcel Lost While Returning to Merchant', 'Urgent', 3),
  ('Parcel Lost', 'Parcel Stolen by Rider', 'Critical', 4),
  ('Parcel Lost', 'Empty Packet Received (Product Missing)', 'Critical', 4),
  ('Parcel Lost', 'Some Items Missing from Parcel', 'Critical', 4),
  ('Parcel Lost', 'Trackless Parcel', 'Urgent', 3),
  ('Parcel Damage', 'Parcel Damaged at Pickup', 'Urgent', 3),
  ('Parcel Damage', 'Parcel Damaged at Hub', 'Urgent', 3),
  ('Parcel Damage', 'Parcel Damaged on the Way (In Transit)', 'Urgent', 3),
  ('Parcel Damage', 'Parcel Damaged While Delivering', 'Urgent', 3),
  ('Parcel Damage', 'Parcel Damaged While Returning to Merchant', 'Urgent', 3),
  ('Parcel Damage', 'Parcel Damaged by Water / Liquid', 'Urgent', 3),
  ('Fraud & Misconduct', 'Customer Fraud', 'Regular', 2),
  ('Fraud & Misconduct', 'Fake Delivery (Shown Delivered but Not Delivered)', 'Regular', 2),
  ('Fraud & Misconduct', 'Rider Misbehaved', 'Regular', 2),
  ('Fraud & Misconduct', 'Suspicious Re-process Request', 'Urgent', 3),
  ('Wrong Delivery / Tagging', 'Wrong Tag on Parcel', 'Critical', 2),
  ('Wrong Delivery / Tagging', 'Wrong Parcel Info Entered', 'Critical', 2),
  ('Duplicate / No Entry', 'Duplicate Parcel Received', 'Critical', 1),
  ('Duplicate / No Entry', 'No Entry Parcel', 'Urgent', 3),
  ('Routing', 'Parcel Sent to Wrong Hub', 'Urgent', 3),
  ('Delayed Delivery', 'Delivery Late', 'Regular', 2),
  ('Delayed Delivery', 'Return to Merchant Late', 'Regular', 2),
  ('Merchant Service Issue', 'Pickup Not Done / Missed', 'Urgent', 3),
  ('Merchant Service Issue', 'Picked Up but Status Not Updated', 'Regular', 2),
  ('Merchant Service Issue', 'Product Changed / Swapped', 'Critical', 3),
  ('Merchant Service Issue', 'Closed Box Rule Violation', 'Regular', 2),
  ('Financial Adjustment', 'Penalty', 'Regular', 2),
  ('Financial Adjustment', 'Extra Charge Complaint', 'Regular', 2),
  ('Financial Adjustment', 'Weight Charge Correction', 'Regular', 2),
  ('Financial Adjustment', 'Adjustment Request', 'Regular', 2),
  ('Financial Adjustment', 'Money Deducted from Merchant', 'Critical', 4),
  ('Financial Adjustment', 'Money Added to Merchant', 'Critical', 4),
  ('Status / Info Update', 'Update Parcel / Merchant Info', 'Regular', 2),
  ('Status / Info Update', 'ID Cancellation Request', 'Urgent', 3),
  ('Status / Info Update', 'Reverse (Return) ID Request', 'Regular', 2),
  ('Status / Info Update', 'Reverse ID Created by Mistake', 'Regular', 2),
  ('Company Asset', 'Company Asset Lost (Bag, Device etc.)', 'Regular', 2),
  ('Parcel Lost', 'Parcel Lost on Processing', 'Urgent', 3),
  ('Re-processed request', 'Re-processed request', 'Regular', 2)
on conflict (category, sub_category) do nothing;

alter table public.escalations add column if not exists ir_resolve_sla_days integer;
