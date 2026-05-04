-- Update existing production entries for 'Leben' and 'BU'
-- to cap the duration at 35 years for valuation, commission and life values.

UPDATE production_entries
SET 
  valuation_sum = gross_premium * (
    CASE 
      WHEN payment_method = 'monthly' THEN 12 
      WHEN payment_method = 'quarterly' THEN 4 
      WHEN payment_method = 'half_yearly' THEN 2 
      WHEN payment_method = 'yearly' THEN 1 
      WHEN payment_method = 'one_time' THEN 1 
      ELSE 12 
    END
  ) * LEAST(duration, 35),
  
  commission_amount = gross_premium * (
    CASE 
      WHEN payment_method = 'monthly' THEN 12 
      WHEN payment_method = 'quarterly' THEN 4 
      WHEN payment_method = 'half_yearly' THEN 2 
      WHEN payment_method = 'yearly' THEN 1 
      WHEN payment_method = 'one_time' THEN 1 
      ELSE 12 
    END
  ) * LEAST(duration, 35) * (commission_rate / 1000),
  
  life_values = gross_premium * (
    CASE 
      WHEN payment_method = 'monthly' THEN 12 
      WHEN payment_method = 'quarterly' THEN 4 
      WHEN payment_method = 'half_yearly' THEN 2 
      WHEN payment_method = 'yearly' THEN 1 
      WHEN payment_method = 'one_time' THEN 1 
      ELSE 12 
    END
  ) * LEAST(duration, 35) * life_value_factor
WHERE sub_category IN ('Leben', 'BU');