# Form Validation

Building forms with validation, error handling, and submission state.

## Form Store

```ts
import { store } from 'storion/react';

interface FormState {
  values: {
    email: string;
    password: string;
    confirmPassword: string;
  };
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isSubmitting: boolean;
  isValid: boolean;
}

export const signupFormStore = store({
  name: 'signupForm',
  state: {
    values: {
      email: '',
      password: '',
      confirmPassword: '',
    },
    errors: {},
    touched: {},
    isSubmitting: false,
    isValid: false,
  } as FormState,
  setup({ state, update }) {
    const validate = () => {
      const errors: Record<string, string> = {};
      
      // Email validation
      if (!state.values.email) {
        errors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.values.email)) {
        errors.email = 'Invalid email address';
      }
      
      // Password validation
      if (!state.values.password) {
        errors.password = 'Password is required';
      } else if (state.values.password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
      }
      
      // Confirm password
      if (state.values.password !== state.values.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
      
      state.errors = errors;
      state.isValid = Object.keys(errors).length === 0;
      
      return state.isValid;
    };

    return {
      setField: (field: keyof FormState['values'], value: string) => {
        update(draft => {
          draft.values[field] = value;
        });
        validate();
      },

      setTouched: (field: string) => {
        update(draft => {
          draft.touched[field] = true;
        });
      },

      validate,

      submit: async () => {
        // Mark all fields as touched
        update(draft => {
          Object.keys(draft.values).forEach(key => {
            draft.touched[key] = true;
          });
        });

        if (!validate()) return false;

        state.isSubmitting = true;
        
        try {
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Call your API here
          console.log('Submitting:', state.values);
          
          return true;
        } catch (error) {
          state.errors = { submit: 'Failed to submit. Please try again.' };
          return false;
        } finally {
          state.isSubmitting = false;
        }
      },

      reset: () => {
        update(draft => {
          draft.values = { email: '', password: '', confirmPassword: '' };
          draft.errors = {};
          draft.touched = {};
          draft.isSubmitting = false;
          draft.isValid = false;
        });
      },
    };
  },
});
```

## Form Component

```tsx
import { useStore } from 'storion/react';
import { signupFormStore } from './stores';

function SignupForm() {
  const {
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    setField,
    setTouched,
    submit,
    reset,
  } = useStore(({ get }) => {
    const [state, actions] = get(signupFormStore);
    return {
      values: state.values,
      errors: state.errors,
      touched: state.touched,
      isSubmitting: state.isSubmitting,
      isValid: state.isValid,
      ...actions,
    };
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await submit();
    if (success) {
      alert('Account created!');
      reset();
    }
  };

  const getFieldError = (field: string) => {
    return touched[field] ? errors[field] : undefined;
  };

  return (
    <form onSubmit={handleSubmit} className="signup-form">
      <h2>Create Account</h2>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={values.email}
          onChange={e => setField('email', e.target.value)}
          onBlur={() => setTouched('email')}
          className={getFieldError('email') ? 'error' : ''}
        />
        {getFieldError('email') && (
          <span className="error-message">{errors.email}</span>
        )}
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={values.password}
          onChange={e => setField('password', e.target.value)}
          onBlur={() => setTouched('password')}
          className={getFieldError('password') ? 'error' : ''}
        />
        {getFieldError('password') && (
          <span className="error-message">{errors.password}</span>
        )}
      </div>

      <div className="field">
        <label htmlFor="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          value={values.confirmPassword}
          onChange={e => setField('confirmPassword', e.target.value)}
          onBlur={() => setTouched('confirmPassword')}
          className={getFieldError('confirmPassword') ? 'error' : ''}
        />
        {getFieldError('confirmPassword') && (
          <span className="error-message">{errors.confirmPassword}</span>
        )}
      </div>

      {errors.submit && (
        <div className="submit-error">{errors.submit}</div>
      )}

      <button type="submit" disabled={isSubmitting || !isValid}>
        {isSubmitting ? 'Creating...' : 'Create Account'}
      </button>
    </form>
  );
}
```

## Using useLocalStore for Forms

For forms that don't need to share state, use `useLocalStore`:

```tsx
import { useLocalStore } from 'storion/react';
import { signupFormStore } from './stores';

function SignupForm() {
  // Each form instance gets its own state
  const [state, actions] = useLocalStore(signupFormStore);

  // ... rest of the form
}
```

## With Initial Values

```tsx
function EditUserForm({ user }: { user: User }) {
  const [state, actions] = useLocalStore(editFormStore, {
    initialState: {
      values: {
        name: user.name,
        email: user.email,
      },
    },
    deps: [user.id], // Recreate when user changes
  });

  // ... rest of the form
}
```

## Field-Level Components

```tsx
interface FieldProps {
  name: keyof FormState['values'];
  label: string;
  type?: string;
}

function Field({ name, label, type = 'text' }: FieldProps) {
  const { value, error, setField, setTouched } = useStore(({ get }) => {
    const [state, actions] = get(signupFormStore);
    return {
      value: state.values[name],
      error: state.touched[name] ? state.errors[name] : undefined,
      setField: actions.setField,
      setTouched: actions.setTouched,
    };
  });

  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        type={type}
        value={value}
        onChange={e => setField(name, e.target.value)}
        onBlur={() => setTouched(name)}
        className={error ? 'error' : ''}
      />
      {error && <span className="error-message">{error}</span>}
    </div>
  );
}

// Usage
function SignupForm() {
  return (
    <form>
      <Field name="email" label="Email" type="email" />
      <Field name="password" label="Password" type="password" />
      <Field name="confirmPassword" label="Confirm Password" type="password" />
    </form>
  );
}
```

## Key Concepts

1. **Centralized Validation**: Keep validation logic in the store
2. **Touched State**: Only show errors after user interaction
3. **Submission State**: Track loading state during async submit
4. **Field Components**: Reusable field wrappers for consistency
5. **useLocalStore**: Each form instance gets isolated state

## Try It

Check out the [Expense Manager Demo](/demos) for a form with validation in action.

