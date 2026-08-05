-- Focused post-migration regression checks.
-- Run only in a disposable/test database or with the clearly synthetic user
-- and source values below. This file intentionally contains no application
-- secrets or production data.

do $$
declare
  first_claim boolean;
  duplicate_claim boolean;
  retry_claim boolean;
  stale_claim boolean;
  stale_update_count integer;
  test_user text := '__capture_idempotency_test__';
  test_source text := '__test__';
  test_key text := '__atomic_claim__';
  first_token text := '__token_a__';
  retry_token text := '__token_b__';
begin
  delete from capture_requests
   where user_id = test_user and source = test_source and idempotency_key = test_key;

  select claimed into first_claim
    from claim_capture_request(test_user, test_source, test_key, 'hash-a', first_token, 900);
  if first_claim is distinct from true then
    raise exception 'first claim did not win';
  end if;

  if (select status from capture_requests
      where user_id = test_user and source = test_source and idempotency_key = test_key) <> 'processing' then
    raise exception 'first claim did not create a processing lease';
  end if;

  select claimed into duplicate_claim
    from claim_capture_request(test_user, test_source, test_key, 'hash-a', retry_token, 900);
  if duplicate_claim is distinct from false then
    raise exception 'duplicate claim incorrectly won';
  end if;

  update capture_requests
     set status = 'failed', updated_at = now()
   where user_id = test_user and source = test_source and idempotency_key = test_key;

  select claimed into retry_claim
    from claim_capture_request(test_user, test_source, test_key, 'hash-a', retry_token, 900);
  if retry_claim is distinct from true then
    raise exception 'failed request was not retryable';
  end if;

  update capture_requests
     set status = 'processing', updated_at = now() - interval '901 seconds', processing_token = retry_token
   where user_id = test_user and source = test_source and idempotency_key = test_key;

  select claimed into stale_claim
    from claim_capture_request(test_user, test_source, test_key, 'hash-a', first_token, 900);
  if stale_claim is distinct from true then
    raise exception 'stale request was not reclaimable';
  end if;

  update capture_requests
     set status = 'completed'
   where user_id = test_user and source = test_source and idempotency_key = test_key
     and processing_token = retry_token;
  get diagnostics stale_update_count = row_count;
  if stale_update_count <> 0 then
    raise exception 'replaced worker could still finalize the request';
  end if;

  update capture_requests
     set status = 'completed', completed_at = now()
   where user_id = test_user and source = test_source and idempotency_key = test_key
     and status = 'processing' and processing_token = first_token;
  get diagnostics stale_update_count = row_count;
  if stale_update_count <> 1 then
    raise exception 'current worker could not finalize its own request';
  end if;

  begin
    perform claim_capture_request(test_user, test_source, test_key, 'hash-b', retry_token, 900);
    raise exception 'hash reuse was accepted';
  exception when others then
    if sqlerrm <> 'Idempotency key was reused for different content' then
      raise;
    end if;
  end;

  delete from capture_requests
   where user_id = test_user and source = test_source and idempotency_key = test_key;
end;
$$;
