const encryptedStorageModelMock = {
    create: jest.fn(),
    findOneAndDelete: jest.fn(),
    deleteMany: jest.fn(),
    findById: jest.fn(),
}
const utilsMock = {
    decodeObjectFromBase64: jest.fn(),
    encodeObjectToBase64: jest.fn(),
}

jest.mock('@kant2002-diia-inhouse/utils', () => ({ utils: utilsMock }))
jest.mock('../../../src/models/encryptedStorage', () => encryptedStorageModelMock)

import { ObjectId } from 'bson'

import { AuthService } from '@kant2002-diia-inhouse/crypto'
import Logger from '@kant2002-diia-inhouse/diia-logger'
import { EnvService } from '@kant2002-diia-inhouse/env'
import { NotFoundError } from '@kant2002-diia-inhouse/errors'
import { mockInstance } from '@kant2002-diia-inhouse/test'

import { EncryptedStorageService } from '../../../src/services'
import { generateIdentifier } from '../../mocks/randomData'

describe('EncryptedStorageService', () => {
    const logger = mockInstance(Logger)
    const auth = mockInstance(AuthService)
    const envService = mockInstance(EnvService)
    const encryptedStorageService = new EncryptedStorageService(logger, auth, envService)

    beforeEach(() => {
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('method: `save`', () => {
        it('should successfully save data into encrypted storage', async () => {
            const id = generateIdentifier()
            const encodedData = Buffer.from('data').toString('base64')
            const expiration = 1000

            utilsMock.encodeObjectToBase64.mockReturnValueOnce(encodedData)
            jest.spyOn(auth, 'encryptJWE').mockResolvedValueOnce(encodedData)
            jest.spyOn(envService, 'isStage').mockReturnValue(true)
            encryptedStorageModelMock.create.mockResolvedValueOnce({ id })

            expect(await encryptedStorageService.save('data', expiration)).toEqual(id)
            expect(encryptedStorageModelMock.create).toHaveBeenCalledWith({
                data: encodedData,
                expiresAt: new Date(Date.now() + expiration),
                source: 'data',
            })
        })
    })

    describe('method: `get`', () => {
        it('should successfully get data from encrypted storage', async () => {
            const id = new ObjectId(generateIdentifier())
            const expectedData = '{}'
            const encodedData = Buffer.from(Buffer.from(expectedData).toString('base64'), 'base64').toString()

            encryptedStorageModelMock.findById.mockResolvedValueOnce({ data: encodedData })
            jest.spyOn(auth, 'decryptJWE').mockResolvedValueOnce(encodedData)
            utilsMock.decodeObjectFromBase64.mockResolvedValueOnce(expectedData)

            expect(await encryptedStorageService.get(id)).toEqual(expectedData)
            expect(encryptedStorageModelMock.findById).toHaveBeenCalledWith(id)
            expect(auth.decryptJWE).toHaveBeenCalledWith(encodedData)
            expect(utilsMock.decodeObjectFromBase64).toHaveBeenCalledWith(encodedData)
        })
    })

    describe('method: `getSafe`', () => {
        it('should safely get data from encrypted storage', async () => {
            const id = new ObjectId(generateIdentifier())
            const expectedData = '{}'
            const encodedData = Buffer.from(Buffer.from(expectedData).toString('base64'), 'base64').toString()

            encryptedStorageModelMock.findById.mockResolvedValueOnce({ data: encodedData })
            jest.spyOn(auth, 'decryptJWE').mockResolvedValueOnce(encodedData)
            utilsMock.decodeObjectFromBase64.mockResolvedValueOnce(expectedData)

            expect(await encryptedStorageService.getSafe(id)).toEqual(expectedData)
            expect(encryptedStorageModelMock.findById).toHaveBeenCalledWith(id)
            expect(auth.decryptJWE).toHaveBeenCalledWith(encodedData)
            expect(utilsMock.decodeObjectFromBase64).toHaveBeenCalledWith(encodedData)
        })

        it('should return undefined instead of throwing error when dat is missing', async () => {
            const id = new ObjectId(generateIdentifier())
            const expectedError = new NotFoundError('Missing data')

            encryptedStorageModelMock.findById.mockResolvedValueOnce(null)

            expect(await encryptedStorageService.getSafe(id)).toBeUndefined()
            expect(encryptedStorageModelMock.findById).toHaveBeenCalledWith(id)
            expect(logger.error).toHaveBeenCalledWith('Encrypted data is not found in storage', { id })
            expect(logger.log).toHaveBeenCalledWith('Unable to retrieve data from encrypted storage', { err: expectedError })
        })
    })

    describe('method: `update`', () => {
        it('should successfully update data in encrypted storage', async () => {
            const id = new ObjectId(generateIdentifier())
            const encodedData = Buffer.from('updated-data').toString('base64')
            const storedData = { save: jest.fn() }

            utilsMock.encodeObjectToBase64.mockReturnValueOnce(encodedData)
            jest.spyOn(auth, 'encryptJWE').mockResolvedValueOnce(encodedData)
            jest.spyOn(envService, 'isStage').mockReturnValue(true)
            encryptedStorageModelMock.findById.mockResolvedValueOnce(storedData)

            expect(await encryptedStorageService.update(id, 'updated-data')).toBeUndefined()
            expect(storedData.save).toHaveBeenCalledWith()
            expect(storedData).toEqual({ ...storedData, data: encodedData, source: 'updated-data' })
        })
    })

    describe('method: `remove`', () => {
        it('successfully remove encrypted data from storage', async () => {
            const id = new ObjectId(generateIdentifier())
            const storedData = { save: jest.fn() }

            encryptedStorageModelMock.findOneAndDelete.mockResolvedValueOnce(storedData)

            expect(await encryptedStorageService.remove(id)).toBeUndefined()
            expect(encryptedStorageModelMock.findOneAndDelete).toHaveBeenCalledWith({ _id: id })
            expect(logger.info).toHaveBeenCalledWith('Encrypted data removed from storage', { id })
        })

        it('should not fail with error in case there is nothing to remove', async () => {
            const id = new ObjectId(generateIdentifier())

            encryptedStorageModelMock.findOneAndDelete.mockResolvedValueOnce(null)

            expect(await encryptedStorageService.remove(id)).toBeUndefined()
            expect(encryptedStorageModelMock.findOneAndDelete).toHaveBeenCalledWith({ _id: id })
            expect(logger.info).toHaveBeenCalledWith('Encrypted data is not removed from storage: data not found', { id })
        })
    })

    describe('method: `deleteMany`', () => {
        it('should successfully delete meny items per request', async () => {
            const ids = [new ObjectId(generateIdentifier())]
            const res = { deletedCount: 1 }

            encryptedStorageModelMock.deleteMany.mockResolvedValueOnce(res)

            expect(await encryptedStorageService.deleteMany(ids)).toBeUndefined()
            expect(logger.info).toHaveBeenCalledWith(`Encrypted data removed from storage: ${res.deletedCount}`)
        })
    })

    describe('method: `setExpiration`', () => {
        it('should successfully set expiration', async () => {
            const id = new ObjectId(generateIdentifier())
            const expiration = 10000
            const storageItem = { save: jest.fn() }

            encryptedStorageModelMock.findById.mockResolvedValueOnce(storageItem)

            expect(await encryptedStorageService.setExpiration(id, expiration)).toBeUndefined()
            expect(logger.info).toHaveBeenCalledWith('Updated encrypted data expiration date', { id })
            expect(storageItem).toEqual({ ...storageItem, expiresAt: new Date(Date.now() + expiration) })
        })
    })
})
