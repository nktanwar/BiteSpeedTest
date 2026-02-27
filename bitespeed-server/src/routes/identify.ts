import { Router } from 'express'
import prisma from '../prisma'

const router = Router()

router.post('/', async (req, res) => {
  const { email, phoneNumber } = req.body
  if (!email && !phoneNumber) {
    return res.status(400).json({ error: 'email or phoneNumber required' })
  }

  // Normalize inputs to strings
  const emailStr = email ? String(email).toLowerCase() : null
  const phoneStr = phoneNumber ? String(phoneNumber) : null

  // Start transaction
  let result
  try {
    result = await prisma.$transaction(async (tx) => {
    // Step 1: find direct matches
    const directMatches = await tx.contact.findMany({
      where: {
        AND: [
          { deletedAt: null },
          {
            OR: [
              emailStr ? { email: emailStr } : undefined,
              phoneStr ? { phoneNumber: phoneStr } : undefined,
            ].filter(Boolean) as any[],
          },
        ],
      },
    })

    if (directMatches.length === 0) {
      // Step 2: create primary
      const created = await tx.contact.create({
        data: {
          email: emailStr,
          phoneNumber: phoneStr,
          linkPrecedence: 'primary',
        },
      })

      return {
        primaryId: created.id,
        emails: emailStr ? [emailStr] : [],
        phoneNumbers: phoneStr ? [phoneStr] : [],
        secondaryContactIds: [] as number[],
      }
    }

    // Build connected component by expanding on emails and phones
    const emailsSet = new Set<string>()
    const phonesSet = new Set<string>()
    const idsSet = new Set<number>()

    for (const c of directMatches) {
      idsSet.add(c.id)
      if (c.email) emailsSet.add(c.email)
      if (c.phoneNumber) phonesSet.add(c.phoneNumber)
    }

    let expanded = true
    while (expanded) {
      expanded = false
      const emails = Array.from(emailsSet)
      const phones = Array.from(phonesSet)
      const more = await tx.contact.findMany({
        where: {
          AND: [
            { deletedAt: null },
            {
              OR: [
                emails.length ? { email: { in: emails } } : undefined,
                phones.length ? { phoneNumber: { in: phones } } : undefined,
              ].filter(Boolean) as any[],
            },
          ],
        },
      })

      for (const m of more) {
        if (!idsSet.has(m.id)) {
          expanded = true
          idsSet.add(m.id)
          if (m.email) emailsSet.add(m.email)
          if (m.phoneNumber) phonesSet.add(m.phoneNumber)
        }
      }
    }

    const allIds = Array.from(idsSet)
    const allContacts = await tx.contact.findMany({
      where: { id: { in: allIds }, deletedAt: null },
    })

    // Determine primary as oldest createdAt
    allContacts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const primary = allContacts[0]

    // If there are other primaries, convert them to secondary
    const updates: Promise<any>[] = []
    for (const c of allContacts) {
      if (c.id !== primary.id && c.linkPrecedence === 'primary') {
        updates.push(
          tx.contact.update({ where: { id: c.id }, data: { linkPrecedence: 'secondary', linkedId: primary.id } })
        )
      }
    }

    if (updates.length) await Promise.all(updates)

    // Refresh contacts after potential updates
    const finalContacts = await tx.contact.findMany({ where: { id: { in: allIds } } })

    // If incoming info not present, create new secondary linked to primary
    const existingEmails = new Set(finalContacts.filter(c => c.email).map(c => c.email as string))
    const existingPhones = new Set(finalContacts.filter(c => c.phoneNumber).map(c => c.phoneNumber as string))

    let createdSecondary = null
    if ((emailStr && !existingEmails.has(emailStr)) || (phoneStr && !existingPhones.has(phoneStr))) {
      createdSecondary = await tx.contact.create({
        data: {
          email: emailStr,
          phoneNumber: phoneStr,
          linkPrecedence: 'secondary',
          linkedId: primary.id,
        },
      })
      finalContacts.push(createdSecondary)
    }

    // Prepare response values
    // Collect unique emails/phones, ensure primary's values come first
    const emailsArr: string[] = []
    const phonesArr: string[] = []

    if (primary.email) emailsArr.push(primary.email)
    if (primary.phoneNumber) phonesArr.push(primary.phoneNumber)

    for (const c of finalContacts) {
      if (c.id === primary.id) continue
      if (c.email && !emailsArr.includes(c.email)) emailsArr.push(c.email)
      if (c.phoneNumber && !phonesArr.includes(c.phoneNumber)) phonesArr.push(c.phoneNumber)
    }

    const secondaryContactIds = finalContacts.filter(c => c.id !== primary.id).map(c => c.id)

    return {
      primaryId: primary.id,
      emails: emailsArr,
      phoneNumbers: phonesArr,
      secondaryContactIds,
    }
    })
  } catch (err) {
    console.error('identify transaction error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }

  return res.json({ contact: {
    primaryContactId: result.primaryId,
    emails: result.emails,
    phoneNumbers: result.phoneNumbers,
    secondaryContactIds: result.secondaryContactIds,
  }})
})

export default router
