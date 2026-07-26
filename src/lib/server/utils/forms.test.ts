import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formError, formSuccess, validateForm, validationError } from './forms';
import { formatValidationErrors } from './validation';

describe('validateForm', () => {
  const schema = z.object({
    name: z.string().min(2),
    count: z.coerce.number().int().positive(),
  });

  it('returns parsed data for valid FormData', () => {
    const formData = new FormData();
    formData.set('name', 'ok');
    formData.set('count', '3');

    expect(validateForm(formData, schema)).toEqual({
      success: true,
      data: { name: 'ok', count: 3 },
    });
  });

  it('returns field errors for invalid FormData', () => {
    const formData = new FormData();
    formData.set('name', 'x');
    formData.set('count', '0');

    const result = validateForm(formData, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.count).toBeTruthy();
    }
  });

  it('supports arrayKeys via getAll', () => {
    const arraySchema = z.object({
      tags: z.array(z.string()).min(1),
    });
    const formData = new FormData();
    formData.append('tags', 'a');
    formData.append('tags', 'b');

    expect(validateForm(formData, arraySchema, ['tags'])).toEqual({
      success: true,
      data: { tags: ['a', 'b'] },
    });
  });
});

describe('form helpers', () => {
  it('builds success and error shapes', () => {
    expect(formSuccess({ id: 1 }, 'Saved')).toEqual({
      success: true,
      data: { id: 1 },
      message: 'Saved',
    });

    const err = formError('Nope', 422, { name: 'required' });
    expect(err.status).toBe(422);
    expect(err.data).toEqual({ error: 'Nope', errors: { name: 'required' } });

    const validation = validationError({ name: 'too short' });
    expect(validation.status).toBe(400);
    expect(validation.data.error).toBe('Validation failed');
    expect(validation.data.errors).toEqual({ name: 'too short' });
  });
});

describe('formatValidationErrors', () => {
  it('flattens Zod issues by path', () => {
    const parsed = z
      .object({ nested: z.object({ value: z.string().min(2) }) })
      .safeParse({ nested: { value: 'x' } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(formatValidationErrors(parsed.error)).toMatchObject({
        'nested.value': expect.any(String),
      });
    }
  });
});
