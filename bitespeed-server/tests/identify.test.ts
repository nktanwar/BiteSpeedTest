import request from 'supertest'
import app from '../src/app'
import prisma from '../src/prisma'

beforeAll(async () => {
  // ensure clean DB
  await prisma.contact.deleteMany()
  // reset sqlite sequence if available
  try {
    await prisma.$executeRawUnsafe("DELETE FROM sqlite_sequence WHERE name='Contact';")
  } catch (e) {
    // ignore if not sqlite
  }
})

afterAll(async () => {
  await prisma.contact.deleteMany()
  await prisma.$disconnect()
})

test('creates primary when no match exists', async () => {
  const res = await request(app)
    .post('/identify')
    .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' })
    .set('Accept', 'application/json')

  expect(res.status).toBe(200)
  expect(res.body.contact).toBeDefined()
  expect(res.body.contact.emails[0]).toBe('lorraine@hillvalley.edu')
  expect(res.body.contact.phoneNumbers[0]).toBe('123456')
  expect(res.body.contact.secondaryContactIds).toEqual([])
})

test('creates secondary when matching phone with new email', async () => {
  const res = await request(app)
    .post('/identify')
    .send({ email: 'mcfly@hillvalley.edu', phoneNumber: '123456' })
    .set('Accept', 'application/json')

  expect(res.status).toBe(200)
  const contact = res.body.contact
  expect(contact.primaryContactId).toBeDefined()
  expect(contact.emails).toEqual(expect.arrayContaining(['lorraine@hillvalley.edu', 'mcfly@hillvalley.edu']))
  expect(contact.phoneNumbers).toEqual(expect.arrayContaining(['123456']))
  expect(contact.secondaryContactIds.length).toBeGreaterThanOrEqual(1)
})

test('merges two primaries into one (oldest remains primary)', async () => {
  // create two primaries
  const a = await request(app).post('/identify').send({ email: 'george@hillvalley.edu', phoneNumber: '919191' })
  const b = await request(app).post('/identify').send({ email: 'biffsucks@hillvalley.edu', phoneNumber: '717171' })

  // merge via request linking them
  const merge = await request(app).post('/identify').send({ email: 'george@hillvalley.edu', phoneNumber: '717171' })
  expect(merge.status).toBe(200)
  const contact = merge.body.contact
  expect(contact.emails[0]).toBe('george@hillvalley.edu')
  expect(contact.phoneNumbers).toEqual(expect.arrayContaining(['919191','717171']))
  expect(contact.secondaryContactIds.length).toBeGreaterThanOrEqual(1)
})

test('deleted contacts are ignored (deletedAt handling)', async () => {
  // create a contact then mark it deleted
  const created = await prisma.contact.create({ data: { email: 'deleted@x.com', phoneNumber: '555000' } })
  await prisma.contact.update({ where: { id: created.id }, data: { deletedAt: new Date() } })

  // now send identify matching the deleted contact; should create a new primary
  const res = await request(app)
    .post('/identify')
    .send({ email: 'deleted@x.com', phoneNumber: '555000' })
    .set('Accept', 'application/json')

  expect(res.status).toBe(200)
  const contact = res.body.contact
  // new primary should not be the deleted id
  expect(contact.primaryContactId).not.toBe(created.id)
})

test('concurrent requests resolve to a consistent merged identity', async () => {
  // send two concurrent requests with same phone but different emails
  const reqA = request(app).post('/identify').send({ email: 'concurrent1@x.com', phoneNumber: '777777' })
  const reqB = request(app).post('/identify').send({ email: 'concurrent2@x.com', phoneNumber: '777777' })

  const [a, b] = await Promise.all([reqA, reqB])
  expect(a.status).toBe(200)
  expect(b.status).toBe(200)

  // After both, a subsequent identify should return single consolidated group
  const final = await request(app).post('/identify').send({ phoneNumber: '777777' })
  expect(final.status).toBe(200)
  const contact = final.body.contact
  // both emails should be present
  expect(contact.emails).toEqual(expect.arrayContaining(['concurrent1@x.com','concurrent2@x.com']))
  // only one primary id
  expect(contact.primaryContactId).toBeDefined()
})

test('transaction failure does not create partial data', async () => {
  // mock prisma.$transaction to throw using jest.spyOn
  const spy = jest.spyOn(prisma, '$transaction').mockImplementation(async () => { throw new Error('simulated failure') })

  const res = await request(app).post('/identify').send({ email: 'failtest@x.com', phoneNumber: '999999' })
  expect(res.status).toBe(500)

  // ensure no contact was created
  const found = await prisma.contact.findMany({ where: { email: 'failtest@x.com' } })
  expect(found.length).toBe(0)

  spy.mockRestore()
})
