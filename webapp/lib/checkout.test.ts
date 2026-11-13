import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitCheckout } from './checkout'

/**
 * This is the one module here that touches the DOM, and it is covered
 * with a stub document rather than by bringing in jsdom -- four methods
 * is the whole of what it uses, and what needs testing is not how a
 * browser builds a form but that the signed parameters reach the provider
 * unaltered.
 *
 * The parameters were signed server-side with the merchant's HashKey, so
 * anything added, renamed or dropped here makes the provider reject the
 * order -- and a `_blank` target would leave the original tab showing a
 * stale "not subscribed" page behind the finished one.
 */
type StubElement = {
  tagName: string
  attrs: Record<string, string>
  children: StubElement[]
  style: Record<string, string>
  appendChild: (child: StubElement) => void
  submit: () => void
}

const stubDocument = () => {
  const created: StubElement[] = []
  const body: StubElement[] = []
  const submit = vi.fn()

  const createElement = (tagName: string): StubElement => {
    const element: StubElement = {
      tagName,
      attrs: {},
      children: [],
      style: {},
      appendChild: (child) => void element.children.push(child),
      submit,
    }
    // The module assigns method/action/target/type/name/value as
    // properties, so record them where the assertions can read them.
    const proxy = new Proxy(element, {
      set(target, key, value) {
        if (typeof key === 'string' && key !== 'style') target.attrs[key] = String(value)
        return Reflect.set(target, key, value)
      },
    })
    created.push(proxy)
    return proxy
  }

  Object.defineProperty(globalThis, 'document', {
    value: { createElement, body: { appendChild: (el: StubElement) => void body.push(el) } },
    configurable: true,
    writable: true,
  })

  return { created, body, submit }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'document')
})

describe('submitCheckout', () => {
  const order = {
    action: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
    params: { MerchantID: '3002607', TotalAmount: '179', CheckMacValue: 'ABC123' },
  }

  it('posts a form to the provider in the same tab', () => {
    const dom = stubDocument()
    submitCheckout(order)

    const form = dom.created[0]
    expect(form.tagName).toBe('form')
    expect(form.attrs.method).toBe('POST')
    expect(form.attrs.action).toBe(order.action)
    // Not _blank: the provider returns the browser to /subscription/result.
    expect(form.attrs.target).toBe('_self')
  })

  it('carries every parameter as a hidden input, unchanged', () => {
    const dom = stubDocument()
    submitCheckout(order)

    const form = dom.created[0]
    expect(form.children).toHaveLength(3)
    expect(
      form.children.map((input) => [input.attrs.name, input.attrs.value, input.attrs.type])
    ).toEqual([
      ['MerchantID', '3002607', 'hidden'],
      ['TotalAmount', '179', 'hidden'],
      ['CheckMacValue', 'ABC123', 'hidden'],
    ])
  })

  it('submits the form once, from the document body', () => {
    const dom = stubDocument()
    submitCheckout(order)

    expect(dom.body).toHaveLength(1)
    expect(dom.body[0]).toBe(dom.created[0])
    expect(dom.submit).toHaveBeenCalledTimes(1)
  })

  it('hides the form, since it is only a vehicle for the redirect', () => {
    const dom = stubDocument()
    submitCheckout(order)
    expect(dom.created[0].style.display).toBe('none')
  })

  it('submits an order with no parameters rather than throwing', () => {
    const dom = stubDocument()
    submitCheckout({ action: order.action, params: {} })
    expect(dom.created[0].children).toHaveLength(0)
    expect(dom.submit).toHaveBeenCalledTimes(1)
  })
})
