import type { PostPaymentCheckoutResponse } from '@/types/api'

/**
 * Sends the browser to the payment provider's own page.
 *
 * It has to be a real form POST from the user's browser: the cardholder
 * types their card on the provider's domain, and the parameters are a
 * signed set the provider validates, so neither a fetch nor a plain link
 * will do. The signature was produced server-side, which is why nothing
 * here may add to or alter `params`.
 *
 * `_self`, not `_blank`: the provider sends the browser back to
 * /subscription/result when it is done, and opening a second tab would
 * leave the original one showing a stale "not subscribed" page behind
 * the finished one.
 */
export function submitCheckout({ action, params }: PostPaymentCheckoutResponse): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = action
  form.target = '_self'
  form.style.display = 'none'

  for (const [name, value] of Object.entries(params)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }

  document.body.appendChild(form)
  form.submit()
}
