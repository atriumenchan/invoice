import { forwardRef } from 'react';
import { Calendar, Clock, Globe } from 'lucide-react';
import type { InvoiceState } from '../types';
import { amountInWords, computeTotals, fmt2 } from '../lib/calc';
import { LOGO_DATA_URI } from '../assets/logo';
import { DEFAULT_STAMP_SRC } from '../assets/stamp';

/**
 * Invoice preview — markup is a 1:1 port of the original builder.
 * Do not restyle: the exported PDF renders this node directly.
 */
const InvoicePreview = forwardRef<HTMLDivElement, { state: InvoiceState }>(({ state: s }, ref) => {
  const { subtotal, discount, chargeRows, total } = computeTotals(s);
  const useSignImage = s.signMode === 'upload' && s.signImage;
  const stampSrc = s.stampImage || DEFAULT_STAMP_SRC;
  const showTypedSignature = s.showSignature && !s.showStamp;
  const sellerTaxLine = [
    s.showGstin ? `GSTIN: ${s.byGstin}` : '',
    s.showSac ? `SAC/HSN: ${s.bySac}` : '',
  ].filter(Boolean);
  const descWidth = 100 - 6 - 13 - 19 - (s.showQty ? 12 : 0);

  return (
    <div id="invoice" ref={ref}>
      <div className="head">
        <svg className="head-cut" viewBox="0 0 794 132" preserveAspectRatio="none">
          <polygon points="446,0 482,0 362,132 326,132" fill="#c9cfe6" opacity="0.5" />
          <polygon points="520,0 794,0 794,32 584,32" fill="#0e1a3d" />
        </svg>
        <div className="head-row">
          <div>
            <div className="logo-block">
              <img src={LOGO_DATA_URI} alt="ADMEXO logo" />
              <div className="logo-word">
                <span className="ad">AD</span>
                <span className="mexo">MEXO</span>
              </div>
            </div>
          </div>
          <div className="tax-title">
            <h2>{s.docTitle}</h2>
            <div className="num">{s.invNo}</div>
            {s.showBadge && (
              <div>
                <div className="due-badge"><Calendar size={12} strokeWidth={2.2} /> <span>{s.badgeText}</span></div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="meta-strip">
        <div className="m">
          <div className="ic"><Calendar size={15} /></div>
          <div>
            <div className="lbl">INVOICE DATE</div>
            <div className="val">{s.invDate}</div>
          </div>
        </div>
        {s.showDueDate && (
          <div className="m">
            <div className="ic"><Clock size={15} /></div>
            <div>
              <div className="lbl">DUE DATE</div>
              <div className="val">{s.dueDate}</div>
            </div>
          </div>
        )}
        <div className="m">
          <div className="ic"><Globe size={15} /></div>
          <div>
            <div className="lbl">CURRENCY</div>
            <div className="val">{s.currency}</div>
          </div>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="tag">BILLED BY</div>
          <div className="ent">{s.byName}</div>
          <p style={{ fontWeight: 700 }}>{s.bySub}</p>
          <p style={{ whiteSpace: 'pre-line' }}>{s.byAddress}</p>
          {sellerTaxLine.length > 0 && (
            <p className="gst">{sellerTaxLine.join('  |  ')}</p>
          )}
          {s.byCustom.map(
            (f) =>
              (f.label || f.value) && (
                <p className="gst" key={f.id}>
                  {f.label}: {f.value}
                </p>
              )
          )}
        </div>
        <div className="card">
          <div className="tag">BILLED TO</div>
          <div className="ent">{s.toName}</div>
          <p>
            Name: {s.toAttn} &nbsp;|&nbsp; {s.toPhone}
          </p>
          <p>{s.toEmail}</p>
          <p style={{ whiteSpace: 'pre-line' }}>{s.toAddress}</p>
          {s.showGstin && <p className="gst">GSTIN: {s.toGstin}</p>}
          {s.toCustom.map(
            (f) =>
              (f.label || f.value) && (
                <p className="gst" key={f.id}>
                  {f.label}: {f.value}
                </p>
              )
          )}
        </div>
      </div>

      <table className="items">
        <thead>
          <tr>
            <th style={{ width: '6%' }}>NO.</th>
            <th style={{ width: `${descWidth}%` }}>SERVICE DESCRIPTION</th>
            {s.showQty && <th style={{ width: '12%' }}>QTY</th>}
            <th style={{ width: '13%' }} className="right">RATE</th>
            <th style={{ width: '19%' }} className="right">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((item, idx) => {
            const amt = (s.showQty ? item.qty || 0 : 1) * (item.rate || 0);
            return (
              <tr key={item.id}>
                <td className="num-col">{idx + 1}</td>
                <td>
                  <div className="desc">{item.desc}</div>
                  {item.period && <div className="period">{item.period}</div>}
                </td>
                {s.showQty && <td>{item.qty}</td>}
                <td className="right">{fmt2(item.rate)}</td>
                <td className="right">{fmt2(amt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="items-note">All amounts are stated in {s.currency}.</div>

      <div className="bottom-cards">
        {s.showBank && (
        <div className="card2">
          <h4>BANK TRANSFER DETAILS</h4>
          <div className="kv-row"><span className="k">BENEFICIARY</span><span>{s.bankBenef}</span></div>
          <div className="kv-row"><span className="k">BANK</span><span>{s.bankName}</span></div>
          <div className="kv-row"><span className="k">ACCOUNT NO.</span><span>{s.bankAcNo}</span></div>
          <div className="kv-row"><span className="k">IFSC/SWIFT</span><span>{s.bankIfsc}</span></div>
          <div className="kv-row"><span className="k">ACCOUNT TYPE</span><span>{s.bankAcType}</span></div>
          <div className="kv-row"><span className="k">PAYMENT REF.</span><span>{s.bankRef}</span></div>
          {s.bankCustom.map(
            (f) =>
              (f.label || f.value) && (
                <div className="kv-row" key={f.id}>
                  <span className="k">{f.label.toUpperCase()}</span>
                  <span>{f.value}</span>
                </div>
              )
          )}
        </div>
        )}
        <div className="card2">
          <h4>INVOICE SUMMARY</h4>
          <div className="kv-row"><span className="k">Subtotal</span><span>{fmt2(subtotal)}</span></div>
          {s.showDiscount && (
            <div className="kv-row"><span className="k">Discount</span><span>{fmt2(discount)}</span></div>
          )}
          {chargeRows.map((c) => (
            <div className="kv-row" key={c.id}>
              <span className="k">
                {c.label}
                {c.kind === 'percent' ? ` (${c.value}%)` : ''}
              </span>
              <span>{fmt2(c.amt)}</span>
            </div>
          ))}
          <div className="total-bar">
            <span className="lbl">TOTAL</span>
            <span className="val">{s.currency} {fmt2(total)}</span>
          </div>
        </div>
      </div>

      {s.showNotes && (
        <div className="notes-card">
          <h4>PAYMENT TERMS &amp; NOTES</h4>
          <ul>
            {s.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {(s.showWords || s.showStamp || showTypedSignature) && (
      <div className="words-sign">
        {s.showWords && (
          <div className="words-card">
            <h4>AMOUNT IN WORDS</h4>
            <div className="amt">{amountInWords(total, s.currency)}</div>
          </div>
        )}
        {(s.showStamp || showTypedSignature) && (
        <div className="sign-card">
          <div className="sig-block">
            {s.showStamp && (
              <img
                className="stamp stamp-img"
                src={stampSrc}
                alt=""
                aria-hidden="true"
                style={{
                  opacity: Math.max(0, Math.min(100, s.stampOpacity ?? 46)) / 100,
                  transform: `rotate(${s.stampRotate ?? 0}deg)`,
                  width: `${Math.round((s.stampFontSize ?? 30) * 11)}px`,
                }}
              />
            )}
            {showTypedSignature && (
            <div className="sig">
              {useSignImage ? (
                <img
                  src={s.signImage!}
                  alt="signature"
                  style={{ maxHeight: Math.round((s.signFontSize ?? 38) * 1.55) }}
                />
              ) : (
                <div className="name" style={{ fontFamily: s.signFont, fontSize: `${s.signFontSize ?? 38}px` }}>
                  {s.signName}
                </div>
              )}
            </div>
            )}
          </div>
          {showTypedSignature && (
          <div className="title">
            {useSignImage ? `${s.signName}  |  ${s.signTitle}` : s.signTitle}
          </div>
          )}
        </div>
        )}
      </div>
      )}

      {s.showFooter && (
        <div className="foot">
          <div>
            <span className="fname">{s.footCompany}</span> &nbsp; <span>{s.footRegions}</span>
          </div>
          <div>
            <span>{s.footWeb}</span> &nbsp; Page 1 of 1
          </div>
        </div>
      )}
    </div>
  );
});

InvoicePreview.displayName = 'InvoicePreview';
export default InvoicePreview;
