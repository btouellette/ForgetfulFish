DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = '"RoomSeat"'::regtype
      AND enumlabel = 'A'
  ) THEN
    ALTER TYPE "RoomSeat" RENAME VALUE 'A' TO 'P1';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = '"RoomSeat"'::regtype
      AND enumlabel = 'B'
  ) THEN
    ALTER TYPE "RoomSeat" RENAME VALUE 'B' TO 'P2';
  END IF;
END $$;
