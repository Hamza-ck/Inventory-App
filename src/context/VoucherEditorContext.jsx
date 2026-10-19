import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const Ctx = createContext(null)

/**
 * One voucher editor + one invoice viewer for the whole app. Any page calls
 * openVoucher() / viewInvoice() instead of mounting its own modal copies.
 */
export function VoucherEditorProvider({ children }) {
  const [editor, setEditor] = useState({ open: false, voucher: null, initial: null, nonce: 0 })
  const [invoice, setInvoice] = useState(null)

  // openVoucher()                          -> blank sales voucher
  // openVoucher(existingVoucher)           -> edit
  // openVoucher(null, { type, partyName }) -> prefilled (e.g. "Receive" from a debtor)
  const openVoucher = useCallback((voucher = null, initial = null) => {
    setEditor((e) => ({ open: true, voucher, initial, nonce: e.nonce + 1 }))
  }, [])
  const closeVoucher = useCallback(() => setEditor((e) => ({ ...e, open: false })), [])
  const viewInvoice = useCallback((v) => setInvoice(v), [])
  const closeInvoice = useCallback(() => setInvoice(null), [])

  const value = useMemo(
    () => ({ editor, invoice, openVoucher, closeVoucher, viewInvoice, closeInvoice }),
    [editor, invoice, openVoucher, closeVoucher, viewInvoice, closeInvoice]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useVoucherEditor() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useVoucherEditor must be used inside VoucherEditorProvider')
  return ctx
}
