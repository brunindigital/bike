import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  nome?: string
  pedido?: string
  codigoRastreio?: string
  linkRastreio?: string
  endereco?: string
  produto?: string
  imagem?: string
}

const Email = ({ nome, pedido, codigoRastreio, linkRastreio, endereco, produto, imagem }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Pagamento confirmado — acompanhe seu pedido</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Pagamento confirmado! 🎉</Heading>
        <Text style={text}>
          {nome ? `Olá, ${nome}!` : 'Olá!'} Recebemos o seu pagamento e seu pedido já está sendo
          preparado para envio.
        </Text>

        {imagem ? (
          <Section style={{ textAlign: 'center', margin: '20px 0' }}>
            <img src={imagem} alt={produto || 'Bike ergométrica'} width="280" style={productImage} />
          </Section>
        ) : null}

        <Section style={box}>
          {produto ? (
            <Text style={line}>
              <strong>Produto:</strong> {produto}
            </Text>
          ) : null}
          {pedido ? (
            <Text style={line}>
              <strong>Pedido:</strong> {pedido}
            </Text>
          ) : null}
          {codigoRastreio ? (
            <Text style={line}>
              <strong>Código de rastreio:</strong> {codigoRastreio}
            </Text>
          ) : null}
          {endereco ? (
            <Text style={line}>
              <strong>Entrega em:</strong> {endereco}
            </Text>
          ) : null}
        </Section>

        {linkRastreio ? (
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={linkRastreio} style={button}>
              Rastrear meu pedido
            </Button>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={muted}>
          Guarde este e-mail: com o código acima você acompanha a entrega a qualquer momento.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Pagamento confirmado — código de rastreio do seu pedido',
  displayName: 'Rastreio do pedido',
  previewData: {
    nome: 'Maria Silva',
    pedido: 'pix_1730000000_abc123',
    codigoRastreio: 'BR123456789PN',
    linkRastreio: 'https://trackflowsystem.lovable.app/rastreio/BR123456789PN',
    endereco: 'Rua das Flores, 100 — Centro, São Paulo/SP',
    produto: 'Bike Ergométrica Spinning Profissional 120kg',
    imagem: 'https://inoxhome.lovable.app/images/bike-ergometrica-spinning.webp',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', color: '#111827', margin: '0 0 12px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '22px' }
const box = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  margin: '20px 0',
}
const line = { fontSize: '14px', color: '#111827', margin: '4px 0' }
const button = {
  backgroundColor: '#e11d48',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: 'bold',
  textDecoration: 'none',
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const muted = { fontSize: '12px', color: '#6b7280' }
const productImage = { width: '280px', maxWidth: '100%', height: 'auto', borderRadius: '8px' }