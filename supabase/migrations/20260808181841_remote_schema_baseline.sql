--
-- PostgreSQL database dump
--

\restrict fhp8hY2dwe47ad7h3RkE7m1lFFjptIohBKx3Znc6NIBmoNg6G2mVPcXYHykgi4I

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: finance; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA finance;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: bank_source; Type: TYPE; Schema: finance; Owner: -
--

CREATE TYPE finance.bank_source AS ENUM (
    'shinhan',
    'woori',
    'naverpay',
    'excel',
    'coupang'
);


--
-- Name: category_type; Type: TYPE; Schema: finance; Owner: -
--

CREATE TYPE finance.category_type AS ENUM (
    'revenue',
    'cogs',
    'sga',
    'non_operating',
    'excluded'
);


--
-- Name: close_status; Type: TYPE; Schema: finance; Owner: -
--

CREATE TYPE finance.close_status AS ENUM (
    'open',
    'submitted',
    'confirmed'
);


--
-- Name: member_role; Type: TYPE; Schema: finance; Owner: -
--

CREATE TYPE finance.member_role AS ENUM (
    'admin',
    'classifier',
    'viewer'
);


--
-- Name: wiki_proposer_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wiki_proposer_kind AS ENUM (
    'ai',
    'member',
    'external'
);


--
-- Name: wiki_relation_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wiki_relation_type AS ENUM (
    'agree',
    'conflict',
    'complement',
    'conditional'
);


--
-- Name: wiki_review_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wiki_review_status AS ENUM (
    'draft',
    'approved',
    'rejected'
);


--
-- Name: can_confirm(); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.can_confirm() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public'
    AS $$
  select case
    when (select email from auth.users where id = auth.uid()) = 'thomas.in.park@gmail.com'
      then true
    else coalesce((select can_confirm from finance.members where id = auth.uid()), false)
  end
$$;


--
-- Name: my_brand_scope(); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.my_brand_scope() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public'
    AS $$
  select case
    when (select email from auth.users where id = auth.uid()) = 'thomas.in.park@gmail.com'
      then null
    else (select brand_scope from finance.members where id = auth.uid())
  end
$$;


--
-- Name: my_role(); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.my_role() RETURNS finance.member_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public'
    AS $$
  select case
    when (select email from auth.users where id = auth.uid()) = 'thomas.in.park@gmail.com'
      then 'admin'::finance.member_role
    else (select role from finance.members where id = auth.uid())
  end
$$;


--
-- Name: touch_place_reviews(); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.touch_place_reviews() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.activity_logs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    action text NOT NULL,
    detail text
);


--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.activity_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.activity_logs_id_seq OWNED BY finance.activity_logs.id;


--
-- Name: brand_settings; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.brand_settings (
    brand text NOT NULL,
    banks text[] DEFAULT ARRAY['shinhan'::text, 'woori'::text] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brand_settings_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text, 'personal'::text])))
);


--
-- Name: categories; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.categories (
    id bigint NOT NULL,
    type finance.category_type NOT NULL,
    name text NOT NULL,
    parent_id bigint,
    sort integer DEFAULT 0 NOT NULL,
    in_pnl boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    vat_taxable boolean DEFAULT true NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.categories_id_seq OWNED BY finance.categories.id;


--
-- Name: channel_fees; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.channel_fees (
    ym text NOT NULL,
    amount bigint DEFAULT 0 NOT NULL,
    entered_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    brand text DEFAULT 'garden'::text NOT NULL,
    CONSTRAINT channel_fees_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text])))
);


--
-- Name: pos_sales; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.pos_sales (
    id bigint NOT NULL,
    ym text NOT NULL,
    sale_date date NOT NULL,
    category text NOT NULL,
    qty numeric DEFAULT 0 NOT NULL,
    gross bigint DEFAULT 0 NOT NULL,
    vat bigint DEFAULT 0 NOT NULL,
    supply bigint DEFAULT 0 NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    brand text DEFAULT 'garden'::text NOT NULL,
    store text DEFAULT ''::text NOT NULL,
    CONSTRAINT pos_sales_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text]))),
    CONSTRAINT pos_sales_store_check CHECK ((store = ANY (ARRAY[''::text, 'pangyo'::text, 'yangjae'::text])))
);


--
-- Name: dashboard_pos; Type: VIEW; Schema: finance; Owner: -
--

CREATE VIEW finance.dashboard_pos AS
 SELECT sale_date,
    ym,
    category,
    supply,
    brand,
    store
   FROM finance.pos_sales p
  WHERE ((finance.my_role() IS NOT NULL) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope())));


--
-- Name: transactions; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.transactions (
    id bigint NOT NULL,
    bank finance.bank_source NOT NULL,
    tx_at timestamp with time zone NOT NULL,
    ym text NOT NULL,
    channel text,
    memo text NOT NULL,
    amount_out bigint DEFAULT 0 NOT NULL,
    amount_in bigint DEFAULT 0 NOT NULL,
    balance bigint DEFAULT 0 NOT NULL,
    branch text,
    dedup_hash text NOT NULL,
    normalized_key text NOT NULL,
    category_id bigint,
    classified_by uuid,
    classified_at timestamp with time zone,
    upload_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'bank'::text NOT NULL,
    card_issuer text,
    is_installment boolean DEFAULT false NOT NULL,
    approval_no text,
    brand text DEFAULT 'garden'::text NOT NULL,
    store text,
    split_parent_id bigint,
    CONSTRAINT transactions_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text, 'personal'::text]))),
    CONSTRAINT transactions_store_check CHECK (((store IS NULL) OR (store = ANY (ARRAY['pangyo'::text, 'yangjae'::text]))))
);


--
-- Name: dashboard_tx; Type: VIEW; Schema: finance; Owner: -
--

CREATE VIEW finance.dashboard_tx AS
 SELECT tx_at,
    ym,
    amount_in,
    amount_out,
    category_id,
    brand,
    store
   FROM finance.transactions t
  WHERE ((finance.my_role() IS NOT NULL) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope())));


--
-- Name: garden_tab_access; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.garden_tab_access (
    user_id uuid NOT NULL,
    email text NOT NULL,
    tabs text[],
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sections text[]
);


--
-- Name: inventory; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.inventory (
    ym text NOT NULL,
    kind text NOT NULL,
    amount bigint DEFAULT 0 NOT NULL,
    entered_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    brand text DEFAULT 'garden'::text NOT NULL,
    CONSTRAINT inventory_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text]))),
    CONSTRAINT inventory_kind_check CHECK ((kind = ANY (ARRAY['식자재'::text, '포장소모품'::text])))
);


--
-- Name: members; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.members (
    id uuid NOT NULL,
    email text NOT NULL,
    role finance.member_role,
    can_confirm boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    brand_scope text,
    CONSTRAINT members_brand_scope_check CHECK (((brand_scope IS NULL) OR (brand_scope = ANY (ARRAY['staffmeal'::text, 'garden'::text]))))
);


--
-- Name: monthly_close; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.monthly_close (
    ym text NOT NULL,
    status finance.close_status DEFAULT 'open'::finance.close_status NOT NULL,
    submitted_by uuid,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    brand text DEFAULT 'garden'::text NOT NULL,
    store text DEFAULT ''::text NOT NULL,
    CONSTRAINT monthly_close_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text]))),
    CONSTRAINT monthly_close_store_check CHECK ((store = ANY (ARRAY[''::text, 'pangyo'::text, 'yangjae'::text])))
);


--
-- Name: monthly_category_totals; Type: VIEW; Schema: finance; Owner: -
--

CREATE VIEW finance.monthly_category_totals WITH (security_invoker='true') AS
 SELECT t.ym,
    t.brand,
    c.type,
    c.name AS category,
    sum(t.amount_in) AS total_in,
    sum(t.amount_out) AS total_out
   FROM ((finance.transactions t
     JOIN finance.categories c ON ((c.id = t.category_id)))
     JOIN finance.monthly_close m ON (((m.ym = t.ym) AND (m.brand = t.brand))))
  WHERE (m.status = 'confirmed'::finance.close_status)
  GROUP BY t.ym, t.brand, c.type, c.name;


--
-- Name: notify_prefs; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.notify_prefs (
    user_id uuid NOT NULL,
    email text NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notify_recipients; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.notify_recipients (
    id bigint NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    transfer_enabled boolean DEFAULT true NOT NULL,
    stock_enabled boolean DEFAULT true NOT NULL
);


--
-- Name: notify_recipients_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.notify_recipients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notify_recipients_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.notify_recipients_id_seq OWNED BY finance.notify_recipients.id;


--
-- Name: place_reviews; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.place_reviews (
    id bigint NOT NULL,
    review_id text NOT NULL,
    store_key text NOT NULL,
    place_id text NOT NULL,
    author text,
    rating numeric(2,1),
    content text,
    keywords text[],
    visit_count integer,
    photo_count integer DEFAULT 0,
    reviewed_at timestamp with time zone NOT NULL,
    had_reply boolean DEFAULT false NOT NULL,
    draft text,
    draft_model text,
    draft_at timestamp with time zone,
    reply_text text,
    approved_by text,
    approved_at timestamp with time zone,
    posted_at timestamp with time zone,
    post_error text,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    draft_variants jsonb,
    approved_tone text,
    issue boolean,
    issue_note text,
    issue_categories text[],
    issue_source text,
    CONSTRAINT place_reviews_status_chk CHECK ((status = ANY (ARRAY['new'::text, 'drafted'::text, 'approved'::text, 'posted'::text, 'skipped'::text, 'replied_elsewhere'::text])))
);


--
-- Name: place_reviews_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.place_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: place_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.place_reviews_id_seq OWNED BY finance.place_reviews.id;


--
-- Name: pos_sales_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.pos_sales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.pos_sales_id_seq OWNED BY finance.pos_sales.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.push_subscriptions (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.push_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.push_subscriptions_id_seq OWNED BY finance.push_subscriptions.id;


--
-- Name: rules; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.rules (
    id bigint NOT NULL,
    normalized_key text NOT NULL,
    category_id bigint NOT NULL,
    created_by uuid,
    hit_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    brand text DEFAULT 'garden'::text NOT NULL,
    CONSTRAINT rules_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text])))
);


--
-- Name: rules_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rules_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.rules_id_seq OWNED BY finance.rules.id;


--
-- Name: split_rules; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.split_rules (
    id bigint NOT NULL,
    normalized_key text NOT NULL,
    brand text DEFAULT 'garden'::text NOT NULL,
    allocations jsonb NOT NULL,
    created_by uuid,
    hit_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT split_rules_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text])))
);


--
-- Name: split_rules_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.split_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: split_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.split_rules_id_seq OWNED BY finance.split_rules.id;


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.transactions_id_seq OWNED BY finance.transactions.id;


--
-- Name: transfer_requests; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.transfer_requests (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    requester_id uuid NOT NULL,
    requester_email text NOT NULL,
    vendor_name text NOT NULL,
    doc_date date,
    amount numeric NOT NULL,
    items_summary text,
    bank text,
    account_no text,
    account_holder text,
    memo text,
    image_path text,
    status text DEFAULT 'pending'::text NOT NULL,
    done_by uuid,
    done_by_email text,
    done_at timestamp with time zone,
    brand text,
    CONSTRAINT transfer_requests_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT transfer_requests_brand_check CHECK (((brand IS NULL) OR (brand = ANY (ARRAY['staffmeal'::text, 'garden'::text])))),
    CONSTRAINT transfer_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text])))
);


--
-- Name: transfer_requests_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.transfer_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transfer_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.transfer_requests_id_seq OWNED BY finance.transfer_requests.id;


--
-- Name: uploads; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.uploads (
    id bigint NOT NULL,
    bank finance.bank_source NOT NULL,
    period_start date,
    period_end date,
    blob_url text,
    row_count integer DEFAULT 0 NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'bank'::text NOT NULL,
    card_issuer text,
    settled_tx_id bigint,
    statement_total bigint,
    slot text,
    slot_ym text,
    brand text DEFAULT 'garden'::text NOT NULL,
    CONSTRAINT uploads_brand_check CHECK ((brand = ANY (ARRAY['staffmeal'::text, 'garden'::text])))
);


--
-- Name: uploads_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.uploads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.uploads_id_seq OWNED BY finance.uploads.id;


--
-- Name: vendor_accounts; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.vendor_accounts (
    id bigint NOT NULL,
    vendor_name text NOT NULL,
    bank text,
    account_no text,
    account_holder text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vendor_accounts_id_seq; Type: SEQUENCE; Schema: finance; Owner: -
--

CREATE SEQUENCE finance.vendor_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: finance; Owner: -
--

ALTER SEQUENCE finance.vendor_accounts_id_seq OWNED BY finance.vendor_accounts.id;


--
-- Name: garden_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garden_words (
    id bigint NOT NULL,
    text text NOT NULL,
    season text DEFAULT '여름'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    submit_sid text,
    submit_iphash text,
    CONSTRAINT garden_words_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: garden_words_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.garden_words_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: garden_words_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.garden_words_id_seq OWNED BY public.garden_words.id;


--
-- Name: wiki_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wiki_channels (
    id bigint NOT NULL,
    youtube_channel_id text,
    handle text,
    name text NOT NULL,
    host_name text,
    subscriber_count integer,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    is_retailer boolean DEFAULT false NOT NULL,
    is_star boolean DEFAULT false NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wiki_channels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wiki_channels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wiki_channels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wiki_channels_id_seq OWNED BY public.wiki_channels.id;


--
-- Name: wiki_claim_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wiki_claim_relations (
    id bigint NOT NULL,
    from_claim_id bigint NOT NULL,
    to_claim_id bigint NOT NULL,
    relation public.wiki_relation_type NOT NULL,
    note text,
    status public.wiki_review_status DEFAULT 'draft'::public.wiki_review_status NOT NULL,
    proposer public.wiki_proposer_kind DEFAULT 'ai'::public.wiki_proposer_kind NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wiki_claim_relations_check CHECK ((from_claim_id <> to_claim_id))
);


--
-- Name: wiki_claim_relations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wiki_claim_relations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wiki_claim_relations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wiki_claim_relations_id_seq OWNED BY public.wiki_claim_relations.id;


--
-- Name: wiki_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wiki_claims (
    id bigint NOT NULL,
    topic_id bigint NOT NULL,
    channel_id bigint NOT NULL,
    video_id bigint NOT NULL,
    ts_start_sec integer,
    ts_end_sec integer,
    claim_ko text NOT NULL,
    quote_original text,
    context_note text,
    status public.wiki_review_status DEFAULT 'draft'::public.wiki_review_status NOT NULL,
    proposer public.wiki_proposer_kind DEFAULT 'ai'::public.wiki_proposer_kind NOT NULL,
    proposed_by uuid,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wiki_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wiki_claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wiki_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wiki_claims_id_seq OWNED BY public.wiki_claims.id;


--
-- Name: wiki_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wiki_topics (
    id bigint NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    parent_id bigint,
    description text,
    status public.wiki_review_status DEFAULT 'approved'::public.wiki_review_status NOT NULL,
    proposer public.wiki_proposer_kind DEFAULT 'member'::public.wiki_proposer_kind NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wiki_topics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wiki_topics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wiki_topics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wiki_topics_id_seq OWNED BY public.wiki_topics.id;


--
-- Name: wiki_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wiki_videos (
    id bigint NOT NULL,
    channel_id bigint NOT NULL,
    youtube_video_id text NOT NULL,
    title text NOT NULL,
    published_at timestamp with time zone,
    duration_sec integer,
    transcript_lang text,
    fetched_at timestamp with time zone,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wiki_videos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wiki_videos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wiki_videos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wiki_videos_id_seq OWNED BY public.wiki_videos.id;


--
-- Name: activity_logs id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.activity_logs ALTER COLUMN id SET DEFAULT nextval('finance.activity_logs_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.categories ALTER COLUMN id SET DEFAULT nextval('finance.categories_id_seq'::regclass);


--
-- Name: notify_recipients id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.notify_recipients ALTER COLUMN id SET DEFAULT nextval('finance.notify_recipients_id_seq'::regclass);


--
-- Name: place_reviews id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.place_reviews ALTER COLUMN id SET DEFAULT nextval('finance.place_reviews_id_seq'::regclass);


--
-- Name: pos_sales id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.pos_sales ALTER COLUMN id SET DEFAULT nextval('finance.pos_sales_id_seq'::regclass);


--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('finance.push_subscriptions_id_seq'::regclass);


--
-- Name: rules id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.rules ALTER COLUMN id SET DEFAULT nextval('finance.rules_id_seq'::regclass);


--
-- Name: split_rules id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.split_rules ALTER COLUMN id SET DEFAULT nextval('finance.split_rules_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions ALTER COLUMN id SET DEFAULT nextval('finance.transactions_id_seq'::regclass);


--
-- Name: transfer_requests id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transfer_requests ALTER COLUMN id SET DEFAULT nextval('finance.transfer_requests_id_seq'::regclass);


--
-- Name: uploads id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.uploads ALTER COLUMN id SET DEFAULT nextval('finance.uploads_id_seq'::regclass);


--
-- Name: vendor_accounts id; Type: DEFAULT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.vendor_accounts ALTER COLUMN id SET DEFAULT nextval('finance.vendor_accounts_id_seq'::regclass);


--
-- Name: garden_words id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garden_words ALTER COLUMN id SET DEFAULT nextval('public.garden_words_id_seq'::regclass);


--
-- Name: wiki_channels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_channels ALTER COLUMN id SET DEFAULT nextval('public.wiki_channels_id_seq'::regclass);


--
-- Name: wiki_claim_relations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claim_relations ALTER COLUMN id SET DEFAULT nextval('public.wiki_claim_relations_id_seq'::regclass);


--
-- Name: wiki_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claims ALTER COLUMN id SET DEFAULT nextval('public.wiki_claims_id_seq'::regclass);


--
-- Name: wiki_topics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_topics ALTER COLUMN id SET DEFAULT nextval('public.wiki_topics_id_seq'::regclass);


--
-- Name: wiki_videos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_videos ALTER COLUMN id SET DEFAULT nextval('public.wiki_videos_id_seq'::regclass);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: brand_settings brand_settings_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.brand_settings
    ADD CONSTRAINT brand_settings_pkey PRIMARY KEY (brand);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_type_name_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.categories
    ADD CONSTRAINT categories_type_name_key UNIQUE (type, name);


--
-- Name: channel_fees channel_fees_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.channel_fees
    ADD CONSTRAINT channel_fees_pkey PRIMARY KEY (ym, brand);


--
-- Name: garden_tab_access garden_tab_access_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.garden_tab_access
    ADD CONSTRAINT garden_tab_access_pkey PRIMARY KEY (user_id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (ym, kind, brand);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: monthly_close monthly_close_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.monthly_close
    ADD CONSTRAINT monthly_close_pkey PRIMARY KEY (ym, brand, store);


--
-- Name: notify_prefs notify_prefs_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.notify_prefs
    ADD CONSTRAINT notify_prefs_pkey PRIMARY KEY (user_id);


--
-- Name: notify_recipients notify_recipients_email_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.notify_recipients
    ADD CONSTRAINT notify_recipients_email_key UNIQUE (email);


--
-- Name: notify_recipients notify_recipients_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.notify_recipients
    ADD CONSTRAINT notify_recipients_pkey PRIMARY KEY (id);


--
-- Name: place_reviews place_reviews_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.place_reviews
    ADD CONSTRAINT place_reviews_pkey PRIMARY KEY (id);


--
-- Name: place_reviews place_reviews_review_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.place_reviews
    ADD CONSTRAINT place_reviews_review_id_key UNIQUE (review_id);


--
-- Name: pos_sales pos_sales_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.pos_sales
    ADD CONSTRAINT pos_sales_pkey PRIMARY KEY (id);


--
-- Name: pos_sales pos_sales_sale_date_category_brand_store_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.pos_sales
    ADD CONSTRAINT pos_sales_sale_date_category_brand_store_key UNIQUE (sale_date, category, brand, store);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: rules rules_normalized_key_brand_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.rules
    ADD CONSTRAINT rules_normalized_key_brand_key UNIQUE (normalized_key, brand);


--
-- Name: rules rules_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.rules
    ADD CONSTRAINT rules_pkey PRIMARY KEY (id);


--
-- Name: split_rules split_rules_normalized_key_brand_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.split_rules
    ADD CONSTRAINT split_rules_normalized_key_brand_key UNIQUE (normalized_key, brand);


--
-- Name: split_rules split_rules_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.split_rules
    ADD CONSTRAINT split_rules_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_dedup_hash_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_dedup_hash_key UNIQUE (dedup_hash);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transfer_requests transfer_requests_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transfer_requests
    ADD CONSTRAINT transfer_requests_pkey PRIMARY KEY (id);


--
-- Name: uploads uploads_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);


--
-- Name: vendor_accounts vendor_accounts_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.vendor_accounts
    ADD CONSTRAINT vendor_accounts_pkey PRIMARY KEY (id);


--
-- Name: vendor_accounts vendor_accounts_vendor_name_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.vendor_accounts
    ADD CONSTRAINT vendor_accounts_vendor_name_key UNIQUE (vendor_name);


--
-- Name: garden_words garden_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garden_words
    ADD CONSTRAINT garden_words_pkey PRIMARY KEY (id);


--
-- Name: wiki_channels wiki_channels_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_channels
    ADD CONSTRAINT wiki_channels_handle_key UNIQUE (handle);


--
-- Name: wiki_channels wiki_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_channels
    ADD CONSTRAINT wiki_channels_pkey PRIMARY KEY (id);


--
-- Name: wiki_channels wiki_channels_youtube_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_channels
    ADD CONSTRAINT wiki_channels_youtube_channel_id_key UNIQUE (youtube_channel_id);


--
-- Name: wiki_claim_relations wiki_claim_relations_from_claim_id_to_claim_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claim_relations
    ADD CONSTRAINT wiki_claim_relations_from_claim_id_to_claim_id_key UNIQUE (from_claim_id, to_claim_id);


--
-- Name: wiki_claim_relations wiki_claim_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claim_relations
    ADD CONSTRAINT wiki_claim_relations_pkey PRIMARY KEY (id);


--
-- Name: wiki_claims wiki_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claims
    ADD CONSTRAINT wiki_claims_pkey PRIMARY KEY (id);


--
-- Name: wiki_topics wiki_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_topics
    ADD CONSTRAINT wiki_topics_pkey PRIMARY KEY (id);


--
-- Name: wiki_topics wiki_topics_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_topics
    ADD CONSTRAINT wiki_topics_slug_key UNIQUE (slug);


--
-- Name: wiki_videos wiki_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_videos
    ADD CONSTRAINT wiki_videos_pkey PRIMARY KEY (id);


--
-- Name: wiki_videos wiki_videos_youtube_video_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_videos
    ADD CONSTRAINT wiki_videos_youtube_video_id_key UNIQUE (youtube_video_id);


--
-- Name: activity_logs_created_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX activity_logs_created_idx ON finance.activity_logs USING btree (created_at DESC);


--
-- Name: place_reviews_issue_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX place_reviews_issue_idx ON finance.place_reviews USING btree (issue, reviewed_at DESC) WHERE (issue IS TRUE);


--
-- Name: place_reviews_status_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX place_reviews_status_idx ON finance.place_reviews USING btree (status, reviewed_at DESC);


--
-- Name: place_reviews_store_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX place_reviews_store_idx ON finance.place_reviews USING btree (store_key, reviewed_at DESC);


--
-- Name: pos_sales_ym_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX pos_sales_ym_idx ON finance.pos_sales USING btree (ym);


--
-- Name: push_subscriptions_email_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX push_subscriptions_email_idx ON finance.push_subscriptions USING btree (email);


--
-- Name: transactions_approval_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_approval_idx ON finance.transactions USING btree (approval_no);


--
-- Name: transactions_brand_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_brand_idx ON finance.transactions USING btree (brand);


--
-- Name: transactions_category_id_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_category_id_idx ON finance.transactions USING btree (category_id);


--
-- Name: transactions_normalized_key_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_normalized_key_idx ON finance.transactions USING btree (normalized_key);


--
-- Name: transactions_source_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_source_idx ON finance.transactions USING btree (source);


--
-- Name: transactions_split_parent_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_split_parent_idx ON finance.transactions USING btree (split_parent_id);


--
-- Name: transactions_store_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_store_idx ON finance.transactions USING btree (store);


--
-- Name: transactions_ym_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_ym_idx ON finance.transactions USING btree (ym);


--
-- Name: transfer_requests_status_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transfer_requests_status_idx ON finance.transfer_requests USING btree (status, created_at DESC);


--
-- Name: uploads_slot_ym_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX uploads_slot_ym_idx ON finance.uploads USING btree (slot_ym, slot);


--
-- Name: garden_words_sid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX garden_words_sid_idx ON public.garden_words USING btree (submit_sid);


--
-- Name: garden_words_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX garden_words_status_idx ON public.garden_words USING btree (status, season);


--
-- Name: wiki_claims_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wiki_claims_queue_idx ON public.wiki_claims USING btree (status, created_at) WHERE (status = 'draft'::public.wiki_review_status);


--
-- Name: wiki_claims_topic_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wiki_claims_topic_status_idx ON public.wiki_claims USING btree (topic_id, status);


--
-- Name: wiki_claims_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wiki_claims_video_idx ON public.wiki_claims USING btree (video_id);


--
-- Name: wiki_relations_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wiki_relations_to_idx ON public.wiki_claim_relations USING btree (to_claim_id);


--
-- Name: wiki_videos_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wiki_videos_channel_idx ON public.wiki_videos USING btree (channel_id, published_at DESC);


--
-- Name: place_reviews place_reviews_touch; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER place_reviews_touch BEFORE UPDATE ON finance.place_reviews FOR EACH ROW EXECUTE FUNCTION finance.touch_place_reviews();


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES finance.categories(id);


--
-- Name: channel_fees channel_fees_entered_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.channel_fees
    ADD CONSTRAINT channel_fees_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES auth.users(id);


--
-- Name: garden_tab_access garden_tab_access_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.garden_tab_access
    ADD CONSTRAINT garden_tab_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: inventory inventory_entered_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.inventory
    ADD CONSTRAINT inventory_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES auth.users(id);


--
-- Name: members members_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.members
    ADD CONSTRAINT members_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: monthly_close monthly_close_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.monthly_close
    ADD CONSTRAINT monthly_close_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id);


--
-- Name: monthly_close monthly_close_submitted_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.monthly_close
    ADD CONSTRAINT monthly_close_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);


--
-- Name: notify_prefs notify_prefs_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.notify_prefs
    ADD CONSTRAINT notify_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pos_sales pos_sales_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.pos_sales
    ADD CONSTRAINT pos_sales_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rules rules_category_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.rules
    ADD CONSTRAINT rules_category_id_fkey FOREIGN KEY (category_id) REFERENCES finance.categories(id);


--
-- Name: rules rules_created_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.rules
    ADD CONSTRAINT rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: split_rules split_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.split_rules
    ADD CONSTRAINT split_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: transactions transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES finance.categories(id);


--
-- Name: transactions transactions_classified_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_classified_by_fkey FOREIGN KEY (classified_by) REFERENCES auth.users(id);


--
-- Name: transactions transactions_split_parent_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_split_parent_id_fkey FOREIGN KEY (split_parent_id) REFERENCES finance.transactions(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_upload_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES finance.uploads(id);


--
-- Name: transfer_requests transfer_requests_done_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transfer_requests
    ADD CONSTRAINT transfer_requests_done_by_fkey FOREIGN KEY (done_by) REFERENCES auth.users(id);


--
-- Name: transfer_requests transfer_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transfer_requests
    ADD CONSTRAINT transfer_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: uploads uploads_settled_tx_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.uploads
    ADD CONSTRAINT uploads_settled_tx_id_fkey FOREIGN KEY (settled_tx_id) REFERENCES finance.transactions(id);


--
-- Name: uploads uploads_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.uploads
    ADD CONSTRAINT uploads_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: wiki_claim_relations wiki_claim_relations_from_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claim_relations
    ADD CONSTRAINT wiki_claim_relations_from_claim_id_fkey FOREIGN KEY (from_claim_id) REFERENCES public.wiki_claims(id) ON DELETE CASCADE;


--
-- Name: wiki_claim_relations wiki_claim_relations_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claim_relations
    ADD CONSTRAINT wiki_claim_relations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: wiki_claim_relations wiki_claim_relations_to_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claim_relations
    ADD CONSTRAINT wiki_claim_relations_to_claim_id_fkey FOREIGN KEY (to_claim_id) REFERENCES public.wiki_claims(id) ON DELETE CASCADE;


--
-- Name: wiki_claims wiki_claims_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claims
    ADD CONSTRAINT wiki_claims_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.wiki_channels(id);


--
-- Name: wiki_claims wiki_claims_proposed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claims
    ADD CONSTRAINT wiki_claims_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES auth.users(id);


--
-- Name: wiki_claims wiki_claims_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claims
    ADD CONSTRAINT wiki_claims_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: wiki_claims wiki_claims_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claims
    ADD CONSTRAINT wiki_claims_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.wiki_topics(id);


--
-- Name: wiki_claims wiki_claims_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_claims
    ADD CONSTRAINT wiki_claims_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.wiki_videos(id) ON DELETE CASCADE;


--
-- Name: wiki_topics wiki_topics_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_topics
    ADD CONSTRAINT wiki_topics_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.wiki_topics(id);


--
-- Name: wiki_videos wiki_videos_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wiki_videos
    ADD CONSTRAINT wiki_videos_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.wiki_channels(id) ON DELETE CASCADE;


--
-- Name: activity_logs activity insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "activity insert" ON finance.activity_logs FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: activity_logs activity read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "activity read" ON finance.activity_logs FOR SELECT USING ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'thomas.in.park@gmail.com'::text));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_settings; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.brand_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_settings brand_settings read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "brand_settings read" ON finance.brand_settings FOR SELECT USING ((finance.my_role() IS NOT NULL));


--
-- Name: brand_settings brand_settings write; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "brand_settings write" ON finance.brand_settings USING ((finance.my_role() = 'admin'::finance.member_role)) WITH CHECK ((finance.my_role() = 'admin'::finance.member_role));


--
-- Name: categories; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories cats delete; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "cats delete" ON finance.categories FOR DELETE USING ((finance.my_role() = 'admin'::finance.member_role));


--
-- Name: categories cats insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "cats insert" ON finance.categories FOR INSERT WITH CHECK ((finance.my_role() = 'admin'::finance.member_role));


--
-- Name: categories cats read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "cats read" ON finance.categories FOR SELECT USING ((finance.my_role() IS NOT NULL));


--
-- Name: categories cats update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "cats update" ON finance.categories FOR UPDATE USING ((finance.my_role() = 'admin'::finance.member_role)) WITH CHECK ((finance.my_role() = 'admin'::finance.member_role));


--
-- Name: channel_fees; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.channel_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_fees channel_fees rw; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "channel_fees rw" ON finance.channel_fees USING ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role]))) WITH CHECK ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])));


--
-- Name: monthly_close close read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "close read" ON finance.monthly_close FOR SELECT USING ((finance.my_role() IS NOT NULL));


--
-- Name: monthly_close close write; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "close write" ON finance.monthly_close USING (finance.can_confirm()) WITH CHECK (finance.can_confirm());


--
-- Name: garden_tab_access; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.garden_tab_access ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory inventory rw; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "inventory rw" ON finance.inventory USING ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role]))) WITH CHECK ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])));


--
-- Name: members; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.members ENABLE ROW LEVEL SECURITY;

--
-- Name: members members manage; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "members manage" ON finance.members FOR UPDATE USING (((finance.my_role() = 'admin'::finance.member_role) OR ((auth.jwt() ->> 'email'::text) = 'thomas.in.park@gmail.com'::text))) WITH CHECK (((finance.my_role() = 'admin'::finance.member_role) OR ((auth.jwt() ->> 'email'::text) = 'thomas.in.park@gmail.com'::text)));


--
-- Name: members members read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "members read" ON finance.members FOR SELECT USING (((id = auth.uid()) OR (finance.my_role() = 'admin'::finance.member_role) OR ((auth.jwt() ->> 'email'::text) = 'thomas.in.park@gmail.com'::text)));


--
-- Name: monthly_close; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.monthly_close ENABLE ROW LEVEL SECURITY;

--
-- Name: notify_prefs notify prefs insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "notify prefs insert" ON finance.notify_prefs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: notify_prefs notify prefs read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "notify prefs read" ON finance.notify_prefs FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: notify_prefs notify prefs update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "notify prefs update" ON finance.notify_prefs FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: notify_recipients notify recipients delete; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "notify recipients delete" ON finance.notify_recipients FOR DELETE USING ((finance.my_role() = 'admin'::finance.member_role));


--
-- Name: notify_recipients notify recipients insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "notify recipients insert" ON finance.notify_recipients FOR INSERT WITH CHECK ((finance.my_role() = 'admin'::finance.member_role));


--
-- Name: notify_recipients notify recipients read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "notify recipients read" ON finance.notify_recipients FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: notify_recipients notify recipients update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "notify recipients update" ON finance.notify_recipients FOR UPDATE USING ((finance.my_role() = 'admin'::finance.member_role)) WITH CHECK ((finance.my_role() = 'admin'::finance.member_role));


--
-- Name: notify_prefs; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.notify_prefs ENABLE ROW LEVEL SECURITY;

--
-- Name: notify_recipients; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.notify_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: garden_tab_access own garden tab access; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "own garden tab access" ON finance.garden_tab_access FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: place_reviews; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.place_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_sales; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.pos_sales ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_sales pos_sales rw; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "pos_sales rw" ON finance.pos_sales USING ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role]))) WITH CHECK ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])));


--
-- Name: push_subscriptions push delete; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "push delete" ON finance.push_subscriptions FOR DELETE USING ((auth.uid() IS NOT NULL));


--
-- Name: push_subscriptions push insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "push insert" ON finance.push_subscriptions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_subscriptions push read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "push read" ON finance.push_subscriptions FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: place_reviews reviews team read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "reviews team read" ON finance.place_reviews FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: place_reviews reviews team update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "reviews team update" ON finance.place_reviews FOR UPDATE USING ((auth.uid() IS NOT NULL));


--
-- Name: rules; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.rules ENABLE ROW LEVEL SECURITY;

--
-- Name: rules rules rw; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "rules rw" ON finance.rules USING (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope())))) WITH CHECK (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope()))));


--
-- Name: members self request; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "self request" ON finance.members FOR INSERT WITH CHECK (((id = auth.uid()) AND (role IS NULL)));


--
-- Name: split_rules split rules rw; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "split rules rw" ON finance.split_rules USING (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope())))) WITH CHECK (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope()))));


--
-- Name: split_rules; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.split_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_requests transfer delete; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "transfer delete" ON finance.transfer_requests FOR DELETE USING ((((status = 'pending'::text) AND (requester_id = auth.uid())) OR (finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role]))));


--
-- Name: transfer_requests transfer done; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "transfer done" ON finance.transfer_requests FOR UPDATE USING ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role]))) WITH CHECK ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])));


--
-- Name: transfer_requests transfer insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "transfer insert" ON finance.transfer_requests FOR INSERT WITH CHECK ((auth.uid() = requester_id));


--
-- Name: transfer_requests transfer read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "transfer read" ON finance.transfer_requests FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: transfer_requests; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.transfer_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions tx read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "tx read" ON finance.transactions FOR SELECT USING (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope()))));


--
-- Name: transactions tx write; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "tx write" ON finance.transactions USING (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope())))) WITH CHECK (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope()))));


--
-- Name: uploads; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: uploads uploads rw; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "uploads rw" ON finance.uploads USING (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope())))) WITH CHECK (((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])) AND ((finance.my_brand_scope() IS NULL) OR (brand = finance.my_brand_scope()))));


--
-- Name: vendor_accounts vendor accounts delete; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "vendor accounts delete" ON finance.vendor_accounts FOR DELETE USING ((finance.my_role() = ANY (ARRAY['admin'::finance.member_role, 'classifier'::finance.member_role])));


--
-- Name: vendor_accounts vendor accounts edit; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "vendor accounts edit" ON finance.vendor_accounts FOR UPDATE USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: vendor_accounts vendor accounts read; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "vendor accounts read" ON finance.vendor_accounts FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: vendor_accounts vendor accounts write; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY "vendor accounts write" ON finance.vendor_accounts FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: vendor_accounts; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.vendor_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_channels authenticated full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated full access" ON public.wiki_channels TO authenticated USING (true) WITH CHECK (true);


--
-- Name: wiki_claim_relations authenticated full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated full access" ON public.wiki_claim_relations TO authenticated USING (true) WITH CHECK (true);


--
-- Name: wiki_claims authenticated full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated full access" ON public.wiki_claims TO authenticated USING (true) WITH CHECK (true);


--
-- Name: wiki_topics authenticated full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated full access" ON public.wiki_topics TO authenticated USING (true) WITH CHECK (true);


--
-- Name: wiki_videos authenticated full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated full access" ON public.wiki_videos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: garden_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.garden_words ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wiki_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_claim_relations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wiki_claim_relations ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wiki_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_topics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wiki_topics ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wiki_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: garden_words words public insert pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "words public insert pending" ON public.garden_words FOR INSERT WITH CHECK (((status = 'pending'::text) AND ((char_length(btrim(text)) >= 1) AND (char_length(btrim(text)) <= 10))));


--
-- Name: garden_words words public read approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "words public read approved" ON public.garden_words FOR SELECT USING ((status = 'approved'::text));


--
-- Name: garden_words words team delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "words team delete" ON public.garden_words FOR DELETE USING ((auth.uid() IS NOT NULL));


--
-- Name: garden_words words team read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "words team read" ON public.garden_words FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: garden_words words team update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "words team update" ON public.garden_words FOR UPDATE USING ((auth.uid() IS NOT NULL));


--
-- Name: SCHEMA finance; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA finance TO anon;
GRANT USAGE ON SCHEMA finance TO authenticated;
GRANT USAGE ON SCHEMA finance TO service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: TABLE activity_logs; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.activity_logs TO anon;
GRANT ALL ON TABLE finance.activity_logs TO authenticated;
GRANT ALL ON TABLE finance.activity_logs TO service_role;


--
-- Name: SEQUENCE activity_logs_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.activity_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.activity_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.activity_logs_id_seq TO service_role;


--
-- Name: TABLE brand_settings; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.brand_settings TO anon;
GRANT ALL ON TABLE finance.brand_settings TO authenticated;
GRANT ALL ON TABLE finance.brand_settings TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.categories TO anon;
GRANT ALL ON TABLE finance.categories TO authenticated;
GRANT ALL ON TABLE finance.categories TO service_role;


--
-- Name: SEQUENCE categories_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.categories_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.categories_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.categories_id_seq TO service_role;


--
-- Name: TABLE channel_fees; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.channel_fees TO anon;
GRANT ALL ON TABLE finance.channel_fees TO authenticated;
GRANT ALL ON TABLE finance.channel_fees TO service_role;


--
-- Name: TABLE pos_sales; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.pos_sales TO anon;
GRANT ALL ON TABLE finance.pos_sales TO authenticated;
GRANT ALL ON TABLE finance.pos_sales TO service_role;


--
-- Name: TABLE dashboard_pos; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.dashboard_pos TO anon;
GRANT ALL ON TABLE finance.dashboard_pos TO authenticated;
GRANT ALL ON TABLE finance.dashboard_pos TO service_role;


--
-- Name: TABLE transactions; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.transactions TO anon;
GRANT ALL ON TABLE finance.transactions TO authenticated;
GRANT ALL ON TABLE finance.transactions TO service_role;


--
-- Name: TABLE dashboard_tx; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.dashboard_tx TO anon;
GRANT ALL ON TABLE finance.dashboard_tx TO authenticated;
GRANT ALL ON TABLE finance.dashboard_tx TO service_role;


--
-- Name: TABLE garden_tab_access; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.garden_tab_access TO anon;
GRANT ALL ON TABLE finance.garden_tab_access TO authenticated;
GRANT ALL ON TABLE finance.garden_tab_access TO service_role;


--
-- Name: TABLE inventory; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.inventory TO anon;
GRANT ALL ON TABLE finance.inventory TO authenticated;
GRANT ALL ON TABLE finance.inventory TO service_role;


--
-- Name: TABLE members; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.members TO anon;
GRANT ALL ON TABLE finance.members TO authenticated;
GRANT ALL ON TABLE finance.members TO service_role;


--
-- Name: TABLE monthly_close; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.monthly_close TO anon;
GRANT ALL ON TABLE finance.monthly_close TO authenticated;
GRANT ALL ON TABLE finance.monthly_close TO service_role;


--
-- Name: TABLE monthly_category_totals; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.monthly_category_totals TO anon;
GRANT ALL ON TABLE finance.monthly_category_totals TO authenticated;
GRANT ALL ON TABLE finance.monthly_category_totals TO service_role;


--
-- Name: TABLE notify_prefs; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.notify_prefs TO anon;
GRANT ALL ON TABLE finance.notify_prefs TO authenticated;
GRANT ALL ON TABLE finance.notify_prefs TO service_role;


--
-- Name: TABLE notify_recipients; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.notify_recipients TO anon;
GRANT ALL ON TABLE finance.notify_recipients TO authenticated;
GRANT ALL ON TABLE finance.notify_recipients TO service_role;


--
-- Name: SEQUENCE notify_recipients_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.notify_recipients_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.notify_recipients_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.notify_recipients_id_seq TO service_role;


--
-- Name: TABLE place_reviews; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.place_reviews TO anon;
GRANT ALL ON TABLE finance.place_reviews TO authenticated;
GRANT ALL ON TABLE finance.place_reviews TO service_role;


--
-- Name: SEQUENCE place_reviews_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.place_reviews_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.place_reviews_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.place_reviews_id_seq TO service_role;


--
-- Name: SEQUENCE pos_sales_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.pos_sales_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.pos_sales_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.pos_sales_id_seq TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.push_subscriptions TO anon;
GRANT ALL ON TABLE finance.push_subscriptions TO authenticated;
GRANT ALL ON TABLE finance.push_subscriptions TO service_role;


--
-- Name: SEQUENCE push_subscriptions_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.push_subscriptions_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.push_subscriptions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.push_subscriptions_id_seq TO service_role;


--
-- Name: TABLE rules; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.rules TO anon;
GRANT ALL ON TABLE finance.rules TO authenticated;
GRANT ALL ON TABLE finance.rules TO service_role;


--
-- Name: SEQUENCE rules_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.rules_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.rules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.rules_id_seq TO service_role;


--
-- Name: TABLE split_rules; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.split_rules TO anon;
GRANT ALL ON TABLE finance.split_rules TO authenticated;
GRANT ALL ON TABLE finance.split_rules TO service_role;


--
-- Name: SEQUENCE split_rules_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.split_rules_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.split_rules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.split_rules_id_seq TO service_role;


--
-- Name: SEQUENCE transactions_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.transactions_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.transactions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.transactions_id_seq TO service_role;


--
-- Name: TABLE transfer_requests; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.transfer_requests TO anon;
GRANT ALL ON TABLE finance.transfer_requests TO authenticated;
GRANT ALL ON TABLE finance.transfer_requests TO service_role;


--
-- Name: SEQUENCE transfer_requests_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.transfer_requests_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.transfer_requests_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.transfer_requests_id_seq TO service_role;


--
-- Name: TABLE uploads; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.uploads TO anon;
GRANT ALL ON TABLE finance.uploads TO authenticated;
GRANT ALL ON TABLE finance.uploads TO service_role;


--
-- Name: SEQUENCE uploads_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.uploads_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.uploads_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.uploads_id_seq TO service_role;


--
-- Name: TABLE vendor_accounts; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.vendor_accounts TO anon;
GRANT ALL ON TABLE finance.vendor_accounts TO authenticated;
GRANT ALL ON TABLE finance.vendor_accounts TO service_role;


--
-- Name: SEQUENCE vendor_accounts_id_seq; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON SEQUENCE finance.vendor_accounts_id_seq TO anon;
GRANT ALL ON SEQUENCE finance.vendor_accounts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE finance.vendor_accounts_id_seq TO service_role;


--
-- Name: TABLE garden_words; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.garden_words TO anon;
GRANT ALL ON TABLE public.garden_words TO authenticated;
GRANT ALL ON TABLE public.garden_words TO service_role;


--
-- Name: SEQUENCE garden_words_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.garden_words_id_seq TO anon;
GRANT ALL ON SEQUENCE public.garden_words_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.garden_words_id_seq TO service_role;


--
-- Name: TABLE wiki_channels; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wiki_channels TO anon;
GRANT ALL ON TABLE public.wiki_channels TO authenticated;
GRANT ALL ON TABLE public.wiki_channels TO service_role;


--
-- Name: SEQUENCE wiki_channels_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.wiki_channels_id_seq TO anon;
GRANT ALL ON SEQUENCE public.wiki_channels_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wiki_channels_id_seq TO service_role;


--
-- Name: TABLE wiki_claim_relations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wiki_claim_relations TO anon;
GRANT ALL ON TABLE public.wiki_claim_relations TO authenticated;
GRANT ALL ON TABLE public.wiki_claim_relations TO service_role;


--
-- Name: SEQUENCE wiki_claim_relations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.wiki_claim_relations_id_seq TO anon;
GRANT ALL ON SEQUENCE public.wiki_claim_relations_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wiki_claim_relations_id_seq TO service_role;


--
-- Name: TABLE wiki_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wiki_claims TO anon;
GRANT ALL ON TABLE public.wiki_claims TO authenticated;
GRANT ALL ON TABLE public.wiki_claims TO service_role;


--
-- Name: SEQUENCE wiki_claims_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.wiki_claims_id_seq TO anon;
GRANT ALL ON SEQUENCE public.wiki_claims_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wiki_claims_id_seq TO service_role;


--
-- Name: TABLE wiki_topics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wiki_topics TO anon;
GRANT ALL ON TABLE public.wiki_topics TO authenticated;
GRANT ALL ON TABLE public.wiki_topics TO service_role;


--
-- Name: SEQUENCE wiki_topics_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.wiki_topics_id_seq TO anon;
GRANT ALL ON SEQUENCE public.wiki_topics_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wiki_topics_id_seq TO service_role;


--
-- Name: TABLE wiki_videos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wiki_videos TO anon;
GRANT ALL ON TABLE public.wiki_videos TO authenticated;
GRANT ALL ON TABLE public.wiki_videos TO service_role;


--
-- Name: SEQUENCE wiki_videos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.wiki_videos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.wiki_videos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wiki_videos_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: finance; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: finance; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA finance GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict fhp8hY2dwe47ad7h3RkE7m1lFFjptIohBKx3Znc6NIBmoNg6G2mVPcXYHykgi4I

