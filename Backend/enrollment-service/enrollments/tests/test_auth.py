import time
from types import SimpleNamespace
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.test import TestCase
from jwt.exceptions import PyJWKClientConnectionError
from rest_framework.test import APIClient

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)

ETUDIANT_ID = '11111111-1111-4111-8111-111111111111'
ENSEIGNANT_ID = '3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90'
AUTRE_ID = '22222222-2222-4222-8222-222222222222'


def make_token(sub=ETUDIANT_ID, roles=('ETUDIANT',), key=KEY, alg='RS256',
               issuer=None, exp_delta=1800):
    now = int(time.time())
    payload = {
        'sub': sub,
        'iss': issuer or settings.KEYCLOAK_ISSUER_URI,
        'iat': now,
        'exp': now + exp_delta,
        'aud': 'account',
        'realm_access': {'roles': list(roles) + ['offline_access', 'uma_authorization']},
    }
    return jwt.encode(payload, key, algorithm=alg, headers={'kid': 'test'})


class FakeJwks:
    """Simule Keycloak : renvoie la clé publique de KEY."""
    def get_signing_key_from_jwt(self, token):
        return SimpleNamespace(key=KEY.public_key())


class KeycloakAuthTests(TestCase):
    URL = '/api/enrollments/'

    def setUp(self):
        self.client = APIClient()
        patcher = patch('enrollments.authentication._jwks_client', FakeJwks())
        patcher.start()
        self.addCleanup(patcher.stop)

    def call(self, token=None, method='get', data=None, url=None):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}') if token \
            else self.client.credentials()
        return getattr(self.client, method)(url or self.URL, data, format='json')

    # a) token valide : id = sub, rôle lu dans realm_access.roles
    def test_a_token_valide(self):
        r = self.call(make_token(), 'post', {'cours_id': '5'})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['etudiant_id'], ETUDIANT_ID)

    def test_a_impossible_d_usurper_un_etudiant_id(self):
        r = self.call(make_token(), 'post', {'cours_id': '5', 'etudiant_id': AUTRE_ID})
        self.assertEqual(r.json()['etudiant_id'], ETUDIANT_ID)

    def test_a_etudiant_ne_voit_que_ses_inscriptions(self):
        self.call(make_token(), 'post', {'cours_id': '5'})
        self.call(make_token(sub=AUTRE_ID), 'post', {'cours_id': '7'})
        r = self.call(make_token(), 'get')
        self.assertEqual([i['cours_id'] for i in r.json()], ['5'])

    def test_a_role_le_plus_eleve_gagne(self):
        t = make_token(roles=('ETUDIANT', 'ADMIN'))
        self.assertEqual(self.call(t, 'get').status_code, 200)
        self.assertEqual(self.call(t, 'post', {'cours_id': '5'}).status_code, 403)

    def test_sans_token(self):
        self.assertEqual(self.call().status_code, 401)

    # b) mauvaise signature
    def test_b_mauvaise_signature(self):
        self.assertEqual(self.call(make_token(key=OTHER_KEY)).status_code, 401)

    # c) token expiré
    def test_c_token_expire(self):
        self.assertEqual(self.call(make_token(exp_delta=-60)).status_code, 401)

    # d) mauvais issuer
    def test_d_mauvais_issuer(self):
        t = make_token(issuer='http://evil.example/realms/campushub')
        self.assertEqual(self.call(t).status_code, 401)

    # e) token HS256
    def test_e_token_hs256(self):
        self.assertEqual(self.call(make_token(key='x' * 64, alg='HS256')).status_code, 401)

    # f) aucun rôle CampusHub
    def test_f_sans_role_campushub(self):
        self.assertEqual(self.call(make_token(roles=())).status_code, 403)

    # g) rôle insuffisant sur une route réservée
    def test_g_role_insuffisant(self):
        t = make_token(sub=ENSEIGNANT_ID, roles=('ENSEIGNANT',))
        self.assertEqual(self.call(t, 'post', {'cours_id': '5'}).status_code, 403)

    # h) Keycloak injoignable
    def test_h_keycloak_injoignable(self):
        class Down:
            def get_signing_key_from_jwt(self, token):
                raise PyJWKClientConnectionError('connexion impossible')
        with patch('enrollments.authentication._jwks_client', Down()):
            self.assertEqual(self.call(make_token()).status_code, 503)

    def test_progression(self):
        t = make_token()
        self.call(t, 'post', {'cours_id': '5'})
        iid = self.call(t).json()[0]['id']
        url = f'/api/enrollments/{iid}/progress'          # sans slash final
        self.assertEqual(self.call(t, 'put', {'pourcentage': 45}, url).status_code, 200)
        self.assertEqual(self.call(t, 'get', None, url).json()['pourcentage'], 45)
        self.assertEqual(self.call(t, 'put', {'pourcentage': 150}, url).status_code, 400)

    def test_doublon(self):
        t = make_token()
        self.call(t, 'post', {'cours_id': '5'})
        self.assertEqual(self.call(t, 'post', {'cours_id': '5'}).status_code, 400)

    def test_url_sans_slash_final(self):
        self.assertEqual(self.call(make_token(), 'get', None, '/api/enrollments').status_code, 200)
